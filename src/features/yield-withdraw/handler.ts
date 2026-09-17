// ABOUTME: Yield-withdraw (redeem) handler — single atomic adapt-proof tx with broadcaster fee → POST /relay → poll status. Relayer-mediated (A4).
// ABOUTME: Symmetric with yield-deposit; only the adapter entry point + token roles flip.

import { sendTransaction } from 'wagmi/actions'
import { loadDeployments, loadYieldDeployment } from '@/config/deployments'
import { getChainById, getNetworkConfig } from '@/config/network'
import { wagmiConfig } from '@/config/wagmi'
import { createProvider } from '@/lib/rpc'
import { ensureChain } from '@/lib/network-switch'
import { waitForReceiptOrFail } from '@/lib/tx/receipt'
import { simulateOrThrow } from '@/lib/tx/simulate'
import {
  getShieldedAddress as kmGetShieldedAddress,
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/shielded/keyManager'
import { refreshShieldedBalances } from '@/lib/shielded/sync'
import { buildYieldAdaptSdk } from '@/lib/shielded/yield-sdk'
import { redeemedGrossFromLogs, type TransferLog } from './redeemedGross'
import { encodeTxSelfMetadata } from '@/lib/shielded/selfMetadata'
import { markSpendPendingForRecord, clearSpendPendingForTx } from '@/lib/shielded/pending-spend'
import { submitRelay } from '@/lib/relayer'
import { handleRelaySubmitError } from '@/lib/tx/relaySubmit'
import { advance, markFailed, patchMeta } from '@/lib/tx/reducer'
import { recordBroadcastHash } from '@/lib/tx/broadcast'
import { poll, pollBudgetMs, pollRelayStatusOnce, RELAYER_STATUS_POLL_INTERVAL_MS } from '@/lib/tx/poller'
import { classifyHandlerError } from '@/lib/tx/errors'
import { createProofProgressWriter } from '@/lib/tx/progress'
import { track } from '@/lib/telemetry'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxError, TxRecord } from '@/lib/tx/types'

/**
 * Lifecycle mirrors yield-deposit. `meta.amount` is the SHARES count (ayUSDC), computed by the
 * modal as `requestedUsdc × 1e18 / rate` where rate comes from `useYieldRate()`. If rate moves
 * between quote and execution the user receives slightly more or less than requested — out of
 * scope to slippage-protect for v1.
 */
export const yieldWithdrawHandler: StageHandler<'yield-withdraw'> = {
  kind: 'yield-withdraw',
  resumableFrom: ['submit-relayer', 'hub-pending'],

  async run(record, ctx) {
    try {
      if (record.stage === 'build-proof') {
        await runBuildProof(record, ctx)
        return
      }
      if (record.stage === 'submit-relayer' || record.stage === 'hub-pending') {
        // `submit-relayer` broadcasts (then advances to `hub-pending`); `hub-pending` is the
        // resume/retry entry for an already-broadcast tx — re-entry is idempotent (sourceTxHash
        // present → skips the broadcast, re-waits for confirmation).
        await runSubmitAndConfirm(record, ctx)
        return
      }
    } catch (err) {
      if (ctx.signal.aborted) return
      await ctx.upsert(markFailed(record, classifyHandlerError(err, 'Vault withdrawal failed.', record.artifacts.sourceTxHash, getNetworkConfig().hub.chainId)))
    }
  },
}

/**
 * Reconcile `meta.amount` to the ACTUAL redeemed gross so the confirmed receipt (and complete screen)
 * match the note that landed. The typed amount is a quote-time estimate: the redeem executes on fixed
 * SHARES, and the execution-rate gross differs by the yield accrued between submit and execution.
 *
 * Source it from the ON-CHAIN receipt, not the SDK history — a history read immediately after
 * completion can be pre-settlement (the redeemed USDC re-shield note isn't scanned yet, so `entry.value`
 * transiently reflects only the shares-spend and reads NEGATIVE). The redeemed gross is the USDC
 * transferred INTO the PrivacyPool by `redeemAndShield` (the broadcaster fee is a shielded note, not an
 * ERC-20 transfer, so the inbound USDC to the pool is the full gross). Deterministic + final once mined.
 *
 * Plausibility-guarded: the gross must be positive, cover the fee, and sit within a sane band of the
 * typed estimate (rate slippage is minuscule) — else return undefined and keep the estimate (a later
 * rescan corrects it). Best-effort: any RPC/parse failure also keeps the estimate.
 */
async function reconciledRedeemedGross(
  record: TxRecord<'yield-withdraw'>,
  txHash: `0x${string}`,
): Promise<bigint | undefined> {
  try {
    const deployments = await loadDeployments()
    const usdc = deployments.hub.cctp.usdc.toLowerCase()
    const pool = deployments.hub.contracts.privacyPool.toLowerCase()
    const hubChain = getChainById(getNetworkConfig().hub.chainId)
    if (!hubChain) return undefined
    const receipt = await createProvider(hubChain.rpcUrls).getTransactionReceipt(txHash)
    if (!receipt) return undefined
    return redeemedGrossFromLogs({
      logs: receipt.logs as unknown as ReadonlyArray<TransferLog>,
      usdcAddress: usdc,
      poolAddress: pool,
      fee: record.meta.broadcasterFeeAmount,
      estimate: record.meta.amount,
    })
  } catch {
    return undefined
  }
}

/**
 * Advance the record to terminal `hub-confirmed`, folding the reconciled actual redeemed gross into
 * the SAME write (via patchMeta) so the complete screen shows the real figure directly (no flash), then
 * refresh balances so the UI ticks up.
 */
async function confirmWithReconciledAmount(
  record: TxRecord<'yield-withdraw'>,
  ctx: Parameters<typeof yieldWithdrawHandler.run>[1],
  txHash: `0x${string}`,
): Promise<void> {
  const reconciledGross = await reconciledRedeemedGross(record, txHash)
  let terminal = advance(record, 'hub-confirmed', { sourceTxHash: txHash })
  if (reconciledGross !== undefined) terminal = patchMeta(terminal, { amount: reconciledGross })
  await ctx.upsert(terminal)
  if (kmIsUnlocked()) void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
}

/** A6 — null when wallet-override, otherwise the broadcaster context from meta. */
function broadcasterFeeFromRecord(
  record: TxRecord<'yield-withdraw'>,
): { amount: bigint; recipientAddress: string } | null {
  if (record.meta.useWalletOverride) return null
  return {
    amount: record.meta.broadcasterFeeAmount,
    recipientAddress: record.meta.broadcasterShieldedAddress,
  }
}

async function runBuildProof(
  record: TxRecord<'yield-withdraw'>,
  ctx: Parameters<typeof yieldWithdrawHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Yield withdraw requires an unlocked shielded wallet.')
  }
  const shieldedAddress = kmGetShieldedAddress()
  const deployments = await loadDeployments()
  const yieldDeployment = await loadYieldDeployment()
  if (!yieldDeployment) {
    throw new Error('Yield deployment manifest not found — run `npm run setup`.')
  }
  if (record.meta.shares <= 0n) {
    throw new Error('Withdraw shares is zero — the vault rate may not have synced yet. Try again in a moment.')
  }
  const usdcAddress = deployments.hub.cctp.usdc

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record, ctx.signal)
  // Plan (unshield shares → adapter + re-shield-bundle adaptParams) → prove off-thread → encode
  // redeemAndShield, and stash the calldata + the fee note's random (#312) so submit-relayer
  // dispatches it without re-proving. Survives a reload (persisted in the record).
  const bf = broadcasterFeeFromRecord(record)
  // Persist the recoverable bucket-C fields (#44) in the spend's change note so a fresh scan recovers
  // them even after local storage is cleared.
  const selfMetadata = encodeTxSelfMetadata({
    feeCacheId: record.meta.feeCacheId,
    useWalletOverride: record.meta.useWalletOverride,
    // Persist the reviewed net APY (Tier 4) so the recovered receipt can show the APY row.
    yieldApyBps: record.meta.apyBps,
  })
  const { to, data, feeShieldRandom } = await buildYieldAdaptSdk({
    mode: 'redeem',
    amount: record.meta.shares,
    // Redeem flips the token roles: unshield SHARES (ayUSDC, the vault token) and receive USDC
    // (the underlying) back into the shielded pool.
    unshieldToken: yieldDeployment.contracts.armadaYieldVault as `0x${string}`,
    shieldOutputToken: usdcAddress as `0x${string}`,
    adapterAddress: yieldDeployment.contracts.armadaYieldAdapter as `0x${string}`,
    shieldedAddress,
    broadcasterFee: bf,
    onProgress: progress.write,
    // `recordId` lets the builder stash the plan so submit can mark its inputs pending after broadcast (#55).
    recordId: record.id,
    ...(selfMetadata ? { selfMetadata } : {}),
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  await ctx.upsert(advance(progress.latest(), 'submit-relayer', {
    yieldTx: { to, data, value: '0' },
    // Persisted so submit-relayer can hand the relayer the fee note's random to verify the fee is
    // shielded to it (#312). Undefined on the wallet-override / fee-less path.
    feeShieldRandom,
  }))
}

async function runSubmitAndConfirm(
  record: TxRecord<'yield-withdraw'>,
  ctx: Parameters<typeof yieldWithdrawHandler.run>[1],
): Promise<void> {
  const yieldTx = record.artifacts.yieldTx
  if (!yieldTx) {
    throw new Error('Yield adapt-proof tx missing — re-run build-proof stage.')
  }
  const hubChainId = getNetworkConfig().hub.chainId
  // `yieldTx` is persisted in artifacts at build-proof, so it survives a reload — no re-proving
  // needed on resume. Only the broadcast itself must be guarded against re-entry.
  const existingHash = record.artifacts.sourceTxHash

  // A6 wallet-override — submit the redeemAndShield wrapper calldata via the user's wallet.
  if (record.meta.useWalletOverride) {
    // Idempotency guard (P0-1): never re-broadcast a tx we already sent. On re-entry skip to the
    // receipt wait for the known hash.
    let hash = existingHash
    let broadcastRecord = record
    if (!hash) {
      await ensureChain(hubChainId)
      if (ctx.signal.aborted) throw new Error('cancelled')
      // S-M8: pre-flight simulate so an on-chain revert surfaces as a typed PRE_FLIGHT_REVERT
      // ("nothing was sent") instead of MetaMask's opaque 30M-gas-fallback "gas limit too high".
      const sender = record.walletContext.evmAddress
      if (sender) {
        await simulateOrThrow({
          to: yieldTx.to as `0x${string}`,
          data: yieldTx.data as `0x${string}`,
          value: BigInt(yieldTx.value),
          account: sender as `0x${string}`,
          chainId: hubChainId,
        })
        if (ctx.signal.aborted) throw new Error('cancelled')
      }
      hash = await sendTransaction(wagmiConfig, {
        to: yieldTx.to as `0x${string}`,
        data: yieldTx.data as `0x${string}`,
        value: BigInt(yieldTx.value),
        chainId: hubChainId,
      })
      const broadcast = await recordBroadcastHash(record, hash, ctx)
      if (broadcast.dismissed) return
      broadcastRecord = broadcast.record
      // #55: hold this spend's inputs so a rapid follow-up spend won't reselect them before the
      // Nullified event is scanned. No-op on resume (no stashed plan). Best-effort.
      void markSpendPendingForRecord(record.id, hash)
    }
    // Enter the on-chain confirmation stage before waiting (idempotent for resume), so the stepper
    // shows the confirming step instead of holding on "Submitting transaction".
    if (broadcastRecord.stage !== 'hub-pending') {
      broadcastRecord = advance(broadcastRecord, 'hub-pending')
      await ctx.upsert(broadcastRecord)
    }
    await waitForReceiptOrFail({ hash, signal: ctx.signal, chainId: hubChainId })
    // Syncs balances (awaited) AND reconciles meta.amount to the actual redeemed gross before terminal.
    await confirmWithReconciledAmount(broadcastRecord, ctx, hash)
    return
  }

  // Idempotency guard (P0-1): once the relayer accepted the POST we persist the returned txHash.
  // NEVER re-POST — a duplicate gets a 409 and surfaces a false failure. On re-entry skip to the
  // status poll for the known hash.
  let txHash = existingHash
  let broadcastRecord = record
  if (!txHash) {
    let submitResponse
    try {
      submitResponse = await submitRelay(
        {
          chainId: hubChainId,
          to: yieldTx.to,
          data: yieldTx.data,
          feesCacheId: record.meta.feeCacheId,
          idempotencyKey: record.id,
          // Redeem fee is contract-side (#312); the relayer needs this to verify the fee note is its own.
          feeShieldRandom: record.artifacts.feeShieldRandom,
        },
        ctx.signal,
      )
    } catch (err) {
      // T-M3/S-M1: recover an already-broadcast hash from a DUPLICATE_TX so we resume polling
      // instead of failing a tx the relayer already sent; non-recoverable errors rethrow.
      submitResponse = handleRelaySubmitError(err, { id: record.id, kind: record.kind })
    }

    track('tx.relayer.submitted', { id: record.id, kind: record.kind })

    txHash = submitResponse.txHash as `0x${string}`
    const broadcast = await recordBroadcastHash(record, txHash, ctx)
    if (broadcast.dismissed) return
    broadcastRecord = broadcast.record
    // #55: hold this spend's inputs so a rapid follow-up spend won't reselect them before the
    // Nullified event is scanned. No-op on resume (no stashed plan). Best-effort.
    void markSpendPendingForRecord(record.id, txHash)
  }

  // Enter the on-chain confirmation stage before polling (idempotent for resume/retry), so the
  // stepper shows the confirming step instead of holding on "Submitting transaction".
  if (broadcastRecord.stage !== 'hub-pending') {
    broadcastRecord = advance(broadcastRecord, 'hub-pending')
    await ctx.upsert(broadcastRecord)
  }

  const pollResult = await poll(
    (signal) => pollRelayStatusOnce(txHash, signal, hubChainId),
    { signal: ctx.signal, timeoutMs: pollBudgetMs(record), intervalMs: RELAYER_STATUS_POLL_INTERVAL_MS },
  )

  if (pollResult.status === 'aborted') throw new Error('cancelled')
  if (pollResult.status === 'timeout') {
    const error: TxError = {
      code: 'POLL_TIMEOUT',
      message:
        'The relayer hasn\'t reported a final status. The transaction may still complete on chain — check the explorer.',
      txHash,
    }
    await ctx.upsert(markFailed(broadcastRecord, error))
    return
  }

  const final = pollResult.value
  if (!final) {
    throw new Error('poll returned done without a status value')
  }

  if (final.status === 'failed') {
    track('tx.relayer.rejected', { id: record.id, kind: record.kind, errorCode: 'EXECUTION_FAILED' })
    // #55: the tx reverted → its inputs were NOT nullified on-chain, so release the optimistic hold
    // now instead of waiting out the TTL, freeing the notes for the next spend.
    void clearSpendPendingForTx(txHash)
    const error: TxError = {
      code: 'TX_REVERTED',
      message: final.error ?? 'Relayer-broadcast tx reverted on chain.',
      txHash,
    }
    await ctx.upsert(markFailed(broadcastRecord, error))
    return
  }

  track('tx.relayer.confirmed', { id: record.id, kind: record.kind })

  // Syncs balances (awaited) AND reconciles meta.amount to the actual redeemed gross before terminal.
  await confirmWithReconciledAmount(broadcastRecord, ctx, txHash)
}
