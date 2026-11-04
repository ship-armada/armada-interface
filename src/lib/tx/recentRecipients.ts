// ABOUTME: Derives the Send flow's "recently used addresses" list from settled tx history (deduped by normalized address,
// ABOUTME: newest-first, capped, each with its destination chain) and counts settled sends to one address (Review's recipient history).

import type { TxRecord } from './types'

/** A recipient the user has previously sent to, surfaced as a one-tap option in the Send flow. */
export interface RecentRecipient {
  /** The recipient address exactly as recorded (`0x…` public wallet or `0zk…` shielded). */
  address: string
  /** Which flow produced it — kept so the caller can restore the destination chain on select. */
  kind: 'transfer-shielded' | 'unshield-local' | 'unshield-xchain'
  /**
   * Destination chain to restore when re-selecting a public recipient. `undefined` for a shielded
   * (`0zk`) transfer, which has no destination-chain concept.
   */
  destChainId?: number
  /** `createdAt` (ms) of the most recent send to this address — drives the relative-time label. */
  lastAt: number
}

const RECIPIENT_KINDS = ['transfer-shielded', 'unshield-local', 'unshield-xchain'] as const
type RecipientKind = (typeof RECIPIENT_KINDS)[number]

function isRecipientKind(kind: string): kind is RecipientKind {
  return (RECIPIENT_KINDS as readonly string[]).includes(kind)
}

/** Public (`0x`) addresses compare case-insensitively; shielded (`0zk`) addresses are case-sensitive. */
function dedupeKey(address: string): string {
  return address.startsWith('0x') ? address.toLowerCase() : address
}

export interface DeriveRecentOptions {
  /** Hub chain id — the destination to restore for same-chain (`unshield-local`) recipients. */
  hubChainId: number
  /** Maximum entries to return. */
  limit?: number
}

/**
 * Reduce a tx history to the most recent distinct recipients.
 *
 * Only settled (`completed`) sends count — a failed or in-flight attempt's (possibly typo'd)
 * address shouldn't linger as a suggestion. Records are walked newest-first so the first occurrence
 * of each address wins the dedupe and carries its latest timestamp. Received-transfer records carry
 * no `recipient` (we didn't choose it) and are naturally skipped.
 */
export function deriveRecentRecipients(
  records: readonly TxRecord[],
  { hubChainId, limit = 5 }: DeriveRecentOptions,
): RecentRecipient[] {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  const seen = new Set<string>()
  const out: RecentRecipient[] = []

  for (const record of sorted) {
    if (record.executionState !== 'completed') continue
    if (!isRecipientKind(record.kind)) continue

    const meta = record.meta as { recipient?: string; toChainId?: number }
    const address = meta.recipient
    if (!address) continue

    const key = dedupeKey(address)
    if (seen.has(key)) continue
    seen.add(key)

    const destChainId =
      record.kind === 'unshield-xchain' ? meta.toChainId
      : record.kind === 'unshield-local' ? hubChainId
      : undefined

    out.push({ address, kind: record.kind, destChainId, lastAt: record.createdAt })
    if (out.length >= limit) break
  }

  return out
}

/**
 * How many settled (`completed`) sends already went to `address` — drives the Review step's "New recipient"
 * callout (0) / "History" row ("Sent N times before"). Same matching as the recent list: 0x addresses compare
 * case-insensitively, 0zk exactly; surrounding whitespace is ignored. Local history only — nothing leaves the device.
 */
export function countSendsTo(records: readonly TxRecord[], address: string): number {
  const key = dedupeKey(address.trim())
  let count = 0
  for (const record of records) {
    if (record.executionState !== 'completed' || !isRecipientKind(record.kind)) continue
    const recipient = (record.meta as { recipient?: string }).recipient
    if (recipient && dedupeKey(recipient.trim()) === key) count += 1
  }
  return count
}
