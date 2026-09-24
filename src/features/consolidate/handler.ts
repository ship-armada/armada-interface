// ABOUTME: Consolidate stage handler — merges a fragmented token's notes (armada-sdk #98). Relayer-mediated like a
// ABOUTME: private send: build-proof (up to 4 proofs, one fee each) → POST /relay → poll /status → hub-confirmed.

import { loadDeployments } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import {
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/shielded/keyManager'
import { refreshShieldedBalances } from '@/lib/shielded/sync'
import { buildConsolidateSdk } from '@/lib/shielded/consolidate-sdk'
import { encodeTxSelfMetadata } from '@/lib/shielded/selfMetadata'
import { markSpendPendingForRecord, clearSpendPendingForTx, forgetSpendPlan } from '@/lib/shielded/pending-spend'
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
 * `consolidate` stages (relayer-mediated, same shape as `transfer-shielded`):
 *   1. `build-proof`    — plan the merge (old-tree notes first, then the smallest) and generate its
 *                          Groth16 proofs (up to 4, ~20-30s each on local Anvil), combined into one atomic
 *                          `transact([...])`. Every proof embeds the per-proof USDC fee to the relayer.
 *   2. `submit-relayer` — POST the calldata to the relayer's `/relay`, poll `/status` until confirmed.
 *   3. `hub-confirmed`  — terminal. Kicks a balance refresh.
 *
 * No EVM wallet signature — the relayer broadcasts and pays gas, reimbursed by the fee notes.
 */
export const consolidateHandler: StageHandler<'consolidate'> = {
  kind: 'consolidate',
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
      // Nothing was broadcast on this path (or the stash was already consumed at broadcast), so no
      // input needs holding — drop any stashed plans (#55) rather than keep them for the session.
      forgetSpendPlan(record.id)
      if (ctx.signal.aborted) return
      const failed = markFailed(record, classifyHandlerError(err, 'Merging notes failed.', record.artifacts.sourceTxHash, getNetworkConfig().hub.chainId))
      await ctx.upsert(failed)
    }
  },
}

async function runBuildProof(
  record: TxRecord<'consolidate'>,
  ctx: Parameters<typeof consolidateHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Merging notes requires an unlocked shielded wallet.')
  }
  const deployments = await loadDeployments()

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record, ctx.signal)
  // Tag the merged notes as a consolidation (a merge has no recipient output, so a chain rescan would
  // otherwise read it as an anonymous send) and persist the quote id (#44).
  const selfMetadata = encodeTxSelfMetadata({ feeCacheId: record.meta.feeCacheId, consolidation: true })
  // Plan at the per-proof fee (every proof pays it); `maxTotalFee` is the total the user reviewed — the
  // build refuses to charge more (the wallet may have changed since review).
  const built = await buildConsolidateSdk({
    tokenAddress: record.meta.tokenAddress,
    broadcasterFee: {
      amount: record.meta.broadcasterFeePerProof ?? record.meta.broadcasterFeeAmount,
      recipientAddress: record.meta.broadcasterShieldedAddress,
    },
    maxTotalFee: record.meta.broadcasterFeeAmount,
    poolAddress: deployments.hub.contracts.privacyPool as `0x${string}`,
    onProgress: progress.write,
    recordId: record.id,
    ...(selfMetadata ? { selfMetadata } : {}),
  })
  if (ctx.signal.aborted) throw new Error('cancelled')
  const advanced = advance(progress.latest(), 'submit-relayer', {
    consolidateTx: { to: built.to, data: built.data, value: '0' },
  })
  // Record what the merge actually does (fee ≤ the reviewed fee; the notes may have moved since review).
  await ctx.upsert({
    ...advanced,
    meta: {
      ...advanced.meta,
      broadcasterFeeAmount: built.totalFee,
      notesMerged: built.notesMerged,
      notesCreated: built.notesCreated,
    },
  })
}

async function runSubmitAndConfirm(
  record: TxRecord<'consolidate'>,
  ctx: Parameters<typeof consolidateHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Merging notes requires an unlocked shielded wallet.')
  }
  const hubChainId = getNetworkConfig().hub.chainId
  const existingHash = record.artifacts.sourceTxHash

  // The calldata was built + persisted in build-proof (`artifacts.consolidateTx`), so it survives a
  // reload — dispatch it directly. On re-entry with a hash already broadcast, skip.
  let populated: { to: `0x${string}`; data: `0x${string}`; value: bigint } | undefined
  if (!existingHash) {
    const stashed = record.artifacts.consolidateTx
    if (!stashed) {
      // build-proof always stashes the calldata; its absence means the build never completed —
      // fail honestly (resume's INTERRUPTED path) rather than silently re-proving here.
      throw new Error('Merge calldata missing — start the merge again.')
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
    // #55: hold every merged note so a rapid follow-up spend won't reselect them before the
    // Nullified events are scanned. No-op on resume (no stashed plan). Best-effort.
    void markSpendPendingForRecord(record.id, txHash)
  }

  // Enter the on-chain confirmation stage before polling (idempotent for resume/retry).
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
        'The relayer hasn\'t reported a final status. The merge may still complete on chain — check the explorer.',
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
    // now instead of waiting out the TTL.
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

  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  await ctx.upsert(advance(broadcastRecord, 'hub-confirmed', { sourceTxHash: txHash }))
}
