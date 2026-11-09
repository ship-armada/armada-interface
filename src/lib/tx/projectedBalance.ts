// ABOUTME: projectedBalance — what in-flight transactions add to the SDK's scanned balance until the scan catches up (3B): a
// ABOUTME: broadcast spend's change (recorded from its plans) for exactly as long as the SDK holds its inputs. Pure; per token.

import { mergeTokenSymbol } from '@/lib/shielded/merge-intent'
import type { TxKind, TxRecord } from './types'

export interface BalanceProjection {
  /** Raw USDC to add to the scanned balance. */
  usdc: bigint
  /** Raw vault shares to add to the scanned position. */
  shares: bigint
  /** Something is projected (even a spend that returns nothing): the balance shows a figure the chain hasn't confirmed. */
  confirming: boolean
}

export interface ProjectionInputs {
  /** The active wallet's records. */
  records: readonly TxRecord[]
  /** The submissions whose inputs the SDK still holds (`wallet.pendingSpendTxids()`). */
  heldTxids: readonly string[]
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
 * A spend counts from broadcast for as long as the SDK holds its inputs. The SDK releases a hold in the same sync that
 * scans the spend's `Nullified` event — when its change note is found and joins the scanned balance — so the projected
 * figure hands over to the scanned one with no gap and no double count; a dropped spend (released at once) or one past
 * the SDK's hold TTL simply stops counting. Spec G-11.
 */
export function projectedBalance({ records, heldTxids }: ProjectionInputs): BalanceProjection {
  const held = new Set(heldTxids.map((txid) => txid.toLowerCase()))
  const projection: BalanceProjection = { usdc: 0n, shares: 0n, confirming: false }
  for (const record of records) {
    const hash = record.artifacts.sourceTxHash
    if (hash === undefined || !held.has(hash.toLowerCase())) continue
    const token = spentToken(record)
    if (token === null) continue
    projection.confirming = true
    projection[token] += record.artifacts.returnsToSelf ?? 0n
  }
  return projection
}
