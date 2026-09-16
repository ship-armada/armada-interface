// ABOUTME: History adapter — maps @armada/sdk HistoryEntry values into our TxRecord shape for chain-driven history recovery + incoming-transfer detection.
// ABOUTME: Pure-mappable: historyEntryToTxRecord() takes no React runtime deps so it's unit-testable with hand-rolled fixtures.

import { lifecycleFor } from '@/lib/tx/lifecycles'
import type { TxKind, TxRecord } from '@/lib/tx/types'
import { getHubBlockTimestamps } from './network'
import { readSdkHistory } from './sdk-read'
import { decodeTxSelfMetadata } from './selfMetadata'
import type { HistoryEntry } from '@armada/sdk'

/**
 * Context the mapper needs to stamp records.
 *
 *  - `hubChainId` — used to stamp `walletContext.sourceChainId` on synthesized records. We only
 *    scan hub history today; cross-chain unshield destination correlation is a later pass.
 *  - `usdcAddress` — the hub USDC token address (`0x…`). This app is USDC-centric, but the SDK's
 *    history is ERC20-agnostic (armada-sdk #91) and returns an entry for every token the wallet holds
 *    (vault shares, arbitrary receives). Entries in any other token are filtered out of recovery so
 *    they never render mis-denominated as USDC. This gate also resolves the two-leg yield collision
 *    (#40): a yield op emits a USDC leg + a share leg sharing one `(txid, category)`; the USDC leg
 *    passes, the share leg is dropped, so only one synthetic id per op survives. Matched by ADDRESS
 *    (not token-hash string) so it's immune to hash-formatting differences, and FAIL-OPEN: when the
 *    address can't be resolved the entry is kept (assumed USDC), never silently dropped.
 */
export interface HistoryMapContext {
  hubChainId: number
  usdcAddress: string
}

/** Empty default — convenient for tests + the no-yield-detection path. Empty `usdcAddress` makes the
 *  USDC gate fail open (keep everything), so a mis-wired context never wipes recovered history. */
export const EMPTY_HISTORY_CONTEXT: HistoryMapContext = { hubChainId: 0, usdcAddress: '' }

/**
 * Deterministic synthetic-record id. Encoded as `synth:${txid}:${category}` so re-running the
 * scan produces the same id and `putTxIfFresh` is a no-op (OCC sees `updatedSeq` 0 ≤ 0). Two
 * different categories on the same txid (e.g. yield-deposit re-shields back as an incoming
 * commitment in the same on-chain tx) produce distinct ids — both rows render.
 *
 * Prefix `synth:` is the marker future code reads to distinguish "reconstructed from chain"
 * from "I authored this" (ulid-shaped) without parsing the rest.
 */
export function syntheticTxId(txid: string, category: string): string {
  return `synth:${txid}:${category}`
}

/**
 * Whether an id was minted by `syntheticTxId`. Used to short-circuit duplicate-row detection
 * during incremental scans (don't synthesize over an already-synthetic row), and to drive
 * future UI affordances ("this row was recovered from chain").
 */
export function isSyntheticTxId(id: string): boolean {
  return id.startsWith('synth:')
}

/**
 * Build the `walletContext` block. We don't know which EVM address the user held at the time
 * of an old tx, so `evmAddress` is undefined on synthesized rows — `TxWalletContext` allows it.
 */
function walletContextFor(
  walletId: string,
  hubChainId: number,
): TxRecord['walletContext'] {
  return {
    evmAddress: undefined,
    shieldedWalletId: walletId,
    sourceChainId: hubChainId,
  }
}

/**
 * Synthesize a finished record: born `executionState: 'completed'` with every stage in the
 * lifecycle counted as completed and `stage` parked on the terminal-success stage. The
 * executor's resume probe skips terminal records, so there's no risk of "running" a synthetic.
 */
function terminalizeStages<K extends TxKind>(kind: K): {
  stage: TxRecord<K>['stage']
  stagesCompleted: TxRecord<K>['stagesCompleted']
} {
  const lifecycle = lifecycleFor(kind)
  return {
    stage: lifecycle.terminalSuccess as TxRecord<K>['stage'],
    stagesCompleted: [...lifecycle.stages] as TxRecord<K>['stagesCompleted'],
  }
}

/**
 * High-level scan result handed back to the recovery hook + incoming-transfer detector.
 *
 *  - `records`      — mapped TxRecord[] (filter `Unknown` + corrupt items already applied).
 *  - `highestBlock` — the max `blockNumber` across returned items; null when the scan was empty
 *                     or every item had an undefined block. The caller persists this as the
 *                     next checkpoint so subsequent scans resume from `highestBlock + 1`.
 *  - `itemCount`    — total SDK items the scan returned (mapped + unmapped). Drives telemetry
 *                     so we know if `Unknown`-heavy histories are slipping through.
 */
export interface HistoryScanResult {
  records: TxRecord[]
  highestBlock: number | null
  itemCount: number
}

/**
 * Map an @armada/sdk `HistoryEntry` → `TxRecord`. The SDK classifies yield deposit/withdraw
 * natively and carries recipient + fee + memo inline. `value` is a signed wallet delta
 * (negative = outflow); `timestampMs` is resolved by the caller from `blockNumber`. Returns
 * null only if a future SDK category isn't handled here.
 */
export function historyEntryToTxRecord(
  entry: HistoryEntry,
  walletId: string,
  ctx: HistoryMapContext,
  timestampMs: number,
): TxRecord | null {
  const sourceTxHash = `0x${entry.txid.replace(/^0x/, '')}` as const
  const walletContext = walletContextFor(walletId, ctx.hubChainId)
  const abs = entry.value < 0n ? -entry.value : entry.value
  const broadcasterFee = entry.broadcasterFee ?? 0n
  const broadcasterShieldedAddress = entry.broadcasterShieldedAddress ?? ''
  // Bucket-C fields the SDK recovers from the spend's self-owned change-note memo (#44) — the relayer
  // quote id + submission mode, which a chain scan can't otherwise reconstruct. Empty for entries that
  // carried no self-metadata (older records, receives, shields). `wo` overlays useWalletOverride below.
  const recovered = decodeTxSelfMetadata(entry.selfMetadata)
  const recoveredFeeCacheId = recovered.feeCacheId ?? ''
  const wo = recovered.useWalletOverride ? { useWalletOverride: true as const } : {}
  const artifacts = { sourceTxHash }
  const times = { updatedSeq: 0, createdAt: timestampMs, updatedAt: timestampMs } as const

  // USDC-only recovery gate (see HistoryMapContext.usdcAddress): drop entries in any other token so
  // they never render mis-denominated as USDC (#41), and drop the share leg of a two-leg yield op so
  // only the USDC leg's synthetic id survives (#40). Matched by token ADDRESS (robust to token-hash
  // string formatting) and FAIL-OPEN — an entry with no resolvable token address, or an unresolved
  // USDC address, is kept (assumed USDC / pre-#91 behavior) rather than silently dropping the history.
  const usdcAddress = (ctx.usdcAddress ?? '').toLowerCase()
  const entryToken = (entry.tokenAddress ?? '').toLowerCase()
  if (usdcAddress !== '' && entryToken !== '' && entryToken !== usdcAddress) return null

  switch (entry.category) {
    case 'shield': {
      const stages = terminalizeStages('shield')
      const shieldFee = entry.shieldFee ?? 0n
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'shield', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: {
          // Reconstruct the deposit total so the receipt's `amount - feeAmount - protocolFee` lands on
          // the user's net note (entry.value): user note + its protocol shield fee + the gasless relayer
          // fee note. NOTE: from the user's wallet the relayer note's OWN shield fee isn't attributable
          // (the wallet doesn't own that note), so the recovered total runs ~that fee short of the true
          // deposit — an SDK-side limitation; the recovered received amount is exact.
          amount: entry.value + shieldFee + broadcasterFee, feeCacheId: '', fromChainId: ctx.hubChainId,
          ...(shieldFee > 0n ? { protocolFee: shieldFee } : {}),
          // A recovered shield carrying a broadcaster fee note was a gasless (relayer-submitted)
          // shield — surface the relayer fee so the recovered total matches note + fee (#43).
          ...(broadcasterFee > 0n ? { useGasless: true, feeAmount: broadcasterFee, broadcasterShieldedAddress } : {}),
        },
      }
    }
    case 'self-transfer': {
      // A shielded send to the wallet's own 0zk (a consolidation/rebalance) — the principal comes
      // straight back, so the only real cost is the fee. Recorded as a `transfer-shielded` whose
      // amount IS the fee (issue #39): this keeps the balance-from-history fallback correct (it
      // debits `meta.amount`) and shows a small fee-sized row instead of the old phantom "−194"
      // outgoing that the pre-#88 SDK misclassified as a `transfer-sent`.
      const stages = terminalizeStages('transfer-shielded')
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'transfer-shielded', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: {
          amount: abs, feeCacheId: recoveredFeeCacheId,
          recipient: entry.sentOutputs?.[0]?.recipientShieldedAddress ?? 'self',
          broadcasterFeeAmount: broadcasterFee, broadcasterShieldedAddress, ...wo,
        },
      }
    }
    case 'transfer-received': {
      const stages = terminalizeStages('transfer-shielded-received')
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'transfer-shielded-received', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: {
          amount: entry.value,
          ...(entry.memo ? { memoText: entry.memo } : {}),
          // Present only when the sender chose to disclose their 0zk (otherwise anonymous by design).
          ...(entry.senderShieldedAddress ? { senderShieldedAddress: entry.senderShieldedAddress } : {}),
        },
      }
    }
    case 'transfer-sent': {
      const stages = terminalizeStages('transfer-shielded')
      const recipientAmount = entry.sentOutputs?.reduce((a, o) => a + o.value, 0n) ?? abs - broadcasterFee
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'transfer-shielded', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: {
          amount: recipientAmount, feeCacheId: recoveredFeeCacheId,
          recipient: entry.sentOutputs?.[0]?.recipientShieldedAddress ?? 'unknown',
          broadcasterFeeAmount: broadcasterFee, broadcasterShieldedAddress, ...wo,
          // Recover the memo the sender attached to the recipient's note (`sentOutputs[].memo`).
          ...(entry.sentOutputs?.[0]?.memo ? { memoText: entry.sentOutputs[0].memo } : {}),
        },
      }
    }
    case 'unshield': {
      const stages = terminalizeStages('unshield-local')
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'unshield-local', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: {
          amount: abs - broadcasterFee - (entry.unshieldFee ?? 0n), feeCacheId: recoveredFeeCacheId,
          recipient: entry.recipient ?? 'unknown',
          broadcasterFeeAmount: broadcasterFee, broadcasterShieldedAddress, ...wo,
        },
      }
    }
    case 'yield-deposit': {
      const stages = terminalizeStages('yield-deposit')
      // A gasless deposit spends the relayer fee ON TOP of the vault principal (fee-on-top), so the
      // shielded USDC delta (abs) = principal + relayer fee. Subtract the fee so `amount` is the vault
      // principal — matching the authored record (recipientReceives = amount). The receipt re-adds it
      // as `amount + fee` = total deducted. (Absent a relayer fee this is abs, unchanged.)
      const principal = abs > broadcasterFee ? abs - broadcasterFee : abs
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'yield-deposit', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: { amount: principal, feeCacheId: recoveredFeeCacheId, broadcasterFeeAmount: broadcasterFee, broadcasterShieldedAddress, ...wo },
      }
    }
    case 'yield-withdraw': {
      const stages = terminalizeStages('yield-withdraw')
      // The SDK (#93) now surfaces the redeemed `shares` + the redeem's relayer fee on this leg.
      // `entry.value` is the user's OWNED USDC note = the NET received (the relayer fee note is a
      // separate re-shield the user doesn't own), so the GROSS redeemed = value + fee — matching the
      // authored `amount` (gross), and the receipt's `amount - fee` then renders the net received.
      return {
        id: syntheticTxId(entry.txid, entry.category), kind: 'yield-withdraw', executionState: 'completed',
        stage: stages.stage, stagesCompleted: stages.stagesCompleted, ...times, artifacts, walletContext,
        meta: {
          amount: entry.value + broadcasterFee, feeCacheId: recoveredFeeCacheId,
          shares: entry.shares ?? 0n,
          broadcasterFeeAmount: broadcasterFee, broadcasterShieldedAddress, ...wo,
        },
      }
    }
    default:
      return null
  }
}

/**
 * Single entry point for both first-time recovery and ongoing incoming-transfer detection. Syncs
 * the @armada/sdk wallet, maps its history entries to `TxRecord`s, and surfaces a checkpoint
 * candidate (`highestBlock`). The SDK doesn't stamp a timestamp on every chain, so block times are
 * backfilled in bulk from `getHubBlockTimestamps` (entries without a recovered timestamp keep 0 and
 * sort to the bottom of the feed). Deliberately does NOT touch IDB or atoms — that's the hook's job.
 */
export async function runHistoryScan(
  walletId: string,
  ctx: HistoryMapContext,
  fromBlock: number | undefined,
): Promise<HistoryScanResult> {
  const entries = await readSdkHistory(fromBlock)
  const blocks = [...new Set(entries.map(e => e.blockNumber))]
  const timestamps = blocks.length > 0 ? await getHubBlockTimestamps(blocks) : new Map<number, number>()

  const records: TxRecord[] = []
  let highest: number | null = null
  for (const entry of entries) {
    const seconds = timestamps.get(entry.blockNumber)
    const record = historyEntryToTxRecord(entry, walletId, ctx, seconds !== undefined ? seconds * 1000 : 0)
    if (record) records.push(record)
    if (highest === null || entry.blockNumber > highest) highest = entry.blockNumber
  }
  records.sort((a, b) => b.updatedAt - a.updatedAt)
  return { records, highestBlock: highest, itemCount: entries.length }
}
