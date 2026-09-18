// ABOUTME: Transfer-shielded stage handler — 0zk → 0zk private send. Relayer-mediated submit (A4); zero EVM wallet prompts.
// ABOUTME: Build-proof with broadcaster fee → POST /relay → poll /status → hub-confirmed. Mirrors features/unshield/handler.ts pattern.

import { loadDeployments } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import {
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/shielded/keyManager'
import { refreshShieldedBalances } from '@/lib/shielded/sync'
import { buildTransferSdk } from '@/lib/shielded/transfer-sdk'
import { encodeTxSelfMetadata } from '@/lib/shielded/selfMetadata'
import { markSpendPendingForRecord, clearSpendPendingForTx } from '@/lib/shielded/pending-spend'
import { submitRelay } from '@/lib/relayer'
import { handleRelaySubmitError } from '@/lib/tx/relaySubmit'
import { advance, markFailed } from '@/lib/tx/reducer'
import { recordBroadcastHash } from '@/lib/tx/broadcast'
import { poll, pollBudgetMs, pollRelayStatusOnce, RELAYER_STATUS_POLL_INTERVAL_MS } from '@/lib/tx/poller'
import { classifyHandlerError } from '@/lib/tx/errors'
import { throwIfForcedError } from '@/lib/tx/devForce'
import { createProofProgressWriter } from '@/lib/tx/progress'
import { track } from '@/lib/telemetry'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxError, TxRecord } from '@/lib/tx/types'

/**
 * `transfer-shielded` stages (Phase A4 — relayer-mediated):
 *   1. `build-proof`    — generate the Groth16 transfer proof with broadcaster fee baked in
 *                          (~20-30s on local Anvil). The proof embeds a USDC output to the
 *                          relayer's 0zk address at the advertised fee amount.
 *   2. `submit-relayer` — populate `transact()` calldata, POST to relayer's `/relay`, poll
 *                          `/status` until confirmed (or failed).
 *   3. `hub-confirmed`  — terminal. Kicks a balance refresh.
 *
 * No EVM wallet signature anywhere — proof generation uses the shielded wallet's spending key
 * (`keyManager`); the relayer broadcasts and pays gas in ETH, claiming reimbursement via the
 * embedded broadcaster output. Recipient is a 0zk address (encrypted UTXO bundle).
 */
export const transferShieldedHandler: StageHandler<'transfer-shielded'> = {
  kind: 'transfer-shielded',
  resumableFrom: ['submit-relayer', 'hub-pending'],

  async run(record, ctx) {
    try {
      // DEV: throw the debug-selected outcome (no-op unless meta.devForceError is set).
      throwIfForcedError(record)
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
      // hub-confirmed is terminal; defensive no-op for resume-on-load.
    } catch (err) {
      if (ctx.signal.aborted) return
      const failed = markFailed(record, classifyHandlerError(err, 'Private send failed.', record.artifacts.sourceTxHash, getNetworkConfig().hub.chainId))
      await ctx.upsert(failed)
    }
  },
}

/** The broadcaster fee note context — always present (spends are relayer-submitted; #23). */
function broadcasterFeeFromRecord(
  record: TxRecord<'transfer-shielded'>,
): { amount: bigint; recipientAddress: string } {
  return {
    amount: record.meta.broadcasterFeeAmount,
    recipientAddress: record.meta.broadcasterShieldedAddress,
  }
}

async function runBuildProof(
  record: TxRecord<'transfer-shielded'>,
  ctx: Parameters<typeof transferShieldedHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Private send requires an unlocked shielded wallet.')
  }
  const deployments = await loadDeployments()
  const bf = broadcasterFeeFromRecord(record)

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record, ctx.signal)
  // Persist the recoverable bucket-C fields (#44) in the spend's change note so a fresh scan recovers
  // them even after local storage is cleared.
  const selfMetadata = encodeTxSelfMetadata({
    feeCacheId: record.meta.feeCacheId,
  })
  // Build (plan → prove off-thread → serialize) the transact calldata and stash it, so submit-relayer
  // dispatches it without re-proving — and, persisted in the record, it survives a reload. `recordId`
  // lets the builder stash the plan so submit can mark its inputs pending after broadcast (#55).
  const { to, data } = await buildTransferSdk({
    recipient: record.meta.recipient,
    amount: record.meta.amount,
    broadcasterFee: bf,
    poolAddress: deployments.hub.contracts.privacyPool as `0x${string}`,
    onProgress: progress.write,
    recordId: record.id,
    ...(selfMetadata ? { selfMetadata } : {}),
  })
  if (ctx.signal.aborted) throw new Error('cancelled')
  await ctx.upsert(advance(progress.latest(), 'submit-relayer', { transferTx: { to, data, value: '0' } }))
}

async function runSubmitAndConfirm(
  record: TxRecord<'transfer-shielded'>,
  ctx: Parameters<typeof transferShieldedHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Private send requires an unlocked shielded wallet.')
  }
  const hubChainId = getNetworkConfig().hub.chainId
  const existingHash = record.artifacts.sourceTxHash

  // The transact calldata was built + persisted in build-proof (`artifacts.transferTx`), so it
  // survives a reload — dispatch it directly. On re-entry with a hash already broadcast, skip.
  let populated: { to: `0x${string}`; data: `0x${string}`; value: bigint } | undefined
  if (!existingHash) {
    const stashed = record.artifacts.transferTx
    if (!stashed) {
      // build-proof always stashes the calldata; its absence means the build never completed —
      // fail honestly (resume's INTERRUPTED path) rather than silently re-proving here.
      throw new Error('Transfer calldata missing — start a new transaction.')
    }
    populated = { to: stashed.to, data: stashed.data, value: BigInt(stashed.value) }
  }

  // Idempotency guard (P0-1): once the relayer accepted the POST we persist the returned txHash.
  // NEVER re-POST — a duplicate gets a 409 and surfaces a false failure. On re-entry skip to the
  // status poll for the known hash.
  let txHash = existingHash
  let broadcastRecord = record
  if (!txHash) {
    const tx = populated!
    let submitResponse
    try {
      submitResponse = await submitRelay(
        {
          chainId: hubChainId,
          to: tx.to,
          data: tx.data,
          feesCacheId: record.meta.feeCacheId,
          idempotencyKey: record.id,
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
    const failed = markFailed(broadcastRecord, error)
    await ctx.upsert(failed)
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
    const failed = markFailed(broadcastRecord, error)
    await ctx.upsert(failed)
    return
  }

  track('tx.relayer.confirmed', { id: record.id, kind: record.kind })

  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  const completed = advance(broadcastRecord, 'hub-confirmed', {
    sourceTxHash: txHash,
  })
  await ctx.upsert(completed)
}
