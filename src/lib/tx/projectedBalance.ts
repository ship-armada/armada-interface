// ABOUTME: projectedBalance — what in-flight transactions add to the SDK's scanned balance until the scan catches up (3B): a
// ABOUTME: spend's change while the SDK holds its inputs, a same-chain shield's note until the scan reaches its block. Pure.

import { mergeTokenSymbol } from '@/lib/shielded/merge-intent'
import { txFiguresAs } from '@/lib/fees/txFigures'
import type { TxKind, TxRecord } from './types'

export interface BalanceProjection {
  /** Raw USDC to add to the scanned balance. */
  usdc: bigint
  /** Raw vault shares to add to the scanned position. */
  shares: bigint
  /**
   * A projected transaction hasn't confirmed yet (its record isn't complete — or it failed in a way that may still
   * land): the balance shows a figure the chain hasn't confirmed. A confirmed one the scan hasn't reached yet (the SDK
   * scans `confirmationDepth` behind the tip) still counts in the amounts, but isn't confirming — its notice has shown.
   */
  confirming: boolean
}

export interface ProjectionInputs {
  /** The active wallet's records. */
  records: readonly TxRecord[]
  /** The submissions whose inputs the SDK still holds (`wallet.pendingSpendTxids()`). */
  heldTxids: readonly string[]
  /** The block the SDK's scan has reached (`wallet.syncStatus().syncedThrough`), read with the balances; null before. */
  syncedThrough: number | null
}

/** The token each spend kind spends — and so gets its change back in. A merge spends the token it merges. */
const SPEND_TOKEN: Partial<Record<TxKind, 'usdc' | 'shares'>> = {
  'transfer-shielded': 'usdc',
  'unshield-local': 'usdc',
  'unshield-xchain': 'usdc',
  'yield-deposit': 'usdc',
  'yield-withdraw': 'shares',
}

function spentToken(record: TxRecord): 'usdc' | 'shares' | null {
  if (record.kind === 'consolidate') {
    return (record.meta as { tokenSymbol?: string }).tokenSymbol === mergeTokenSymbol('shares') ? 'shares' : 'usdc'
  }
  return SPEND_TOKEN[record.kind] ?? null
}

/**
 * A same-chain shield's note (the receipt's "you'll receive") counts from broadcast until the SDK's scan reaches the block
 * it confirmed in (`artifacts.hubBlock`, recorded before the sync that scans it) — the read in which the note joins the
 * scanned balance. Not once it failed, was cancelled or ran out of time, and not a completed shield with no recorded block
 * (history, or recovered from chain — already scanned). A cross-chain shield isn't projected: its delivery is a separate
 * transaction.
 */
function shieldNote(record: TxRecord, syncedThrough: number | null): bigint | null {
  if (record.kind !== 'shield' || record.artifacts.sourceTxHash === undefined) return null
  if (record.executionState === 'failed' || record.executionState === 'cancelled' || record.executionState === 'expired') {
    return null
  }
  const hubBlock = (record.artifacts as { hubBlock?: number }).hubBlock
  const note = txFiguresAs(record, 'deposit').netAmount
  if (hubBlock === undefined) return record.executionState === 'completed' ? null : note
  return syncedThrough !== null && syncedThrough >= hubBlock ? null : note
}

/**
 * A spend counts from broadcast for as long as the SDK holds its inputs. The SDK releases a hold in the same sync that
 * scans the spend's `Nullified` event — when its change note is found and joins the scanned balance — so the projected
 * figure hands over to the scanned one with no gap and no double count; a dropped spend (released at once) or one past
 * the SDK's hold TTL simply stops counting. Spec G-12.
 */
export function projectedBalance({ records, heldTxids, syncedThrough }: ProjectionInputs): BalanceProjection {
  const held = new Set(heldTxids.map((txid) => txid.toLowerCase()))
  const projection: BalanceProjection = { usdc: 0n, shares: 0n, confirming: false }
  for (const record of records) {
    const unconfirmed = record.executionState !== 'completed'
    const note = shieldNote(record, syncedThrough)
    if (note !== null) {
      projection.confirming ||= unconfirmed
      projection.usdc += note
      continue
    }
    const hash = record.artifacts.sourceTxHash
    if (hash === undefined || !held.has(hash.toLowerCase())) continue
    const token = spentToken(record)
    if (token === null) continue
    projection.confirming ||= unconfirmed
    projection[token] += record.artifacts.returnsToSelf ?? 0n
  }
  return projection
}
