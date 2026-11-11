// ABOUTME: Tx titles for lists — kindTitle (per kind) and recordTitle (per record: source chain, recipient, vault op), read by
// ABOUTME: the activity adapter. The in-flight processing view's copy lives in processing/processingView.ts.

import type { TxKind, TxRecord } from '@/lib/tx/types'
import { getChainById } from '@/config/network'
import { truncateAddress } from '@/lib/format'

/** Short title used in lists (Recent Activity, In Progress) and in modal headers. */
const KIND_TITLES: Record<TxKind, string> = {
  shield: 'Shield',
  // Cross-chain shield surfaces under the same modal/CTA as same-chain shield; the kind
  // distinction is purely for the lifecycle. From the user's perspective both are shields.
  'shield-xchain': 'Shield',
  // Unshield (the Unshield tab) and a public Send (to a 0x address) both produce `unshield-*` records — there's no separate kind
  // for "Payment" because the contract paths are identical. The Activity list tells an unshield to
  // the user's own wallet from a payment by its recipient (`isWithdrawToSelf`).
  'unshield-local': 'Unshield',
  'unshield-xchain': 'Unshield',
  'transfer-shielded': 'Private transfer',
  // Incoming private transfer reconstructed from chain — someone sent USDC to our 0zk address.
  'transfer-shielded-received': 'Received',
  'yield-deposit': 'Vault deposit',
  'yield-withdraw': 'Vault withdrawal',
  // Note consolidation: merges the wallet's small notes into fewer, larger ones (a self-spend).
  consolidate: 'Merge notes',
}

export function kindTitle(kind: TxKind): string {
  return KIND_TITLES[kind]
}

/**
 * Rich row title for an in-flight or historical record — matches the dashboard mockup's activity
 * copy: deposits name their source chain, public sends name the 0x recipient, private sends read
 * "Sent to private address", vault ops read "Added to / Withdrawn from earn vault". Reads per-kind
 * meta fields; TS can't narrow the union from `record.kind` (TxRecord is parametrised), so the
 * runtime casts are safe — meta is shaped per-kind. Falls back to the bare kind title if a field
 * is missing (defensive — persisted records may carry older schemas).
 */
export function recordTitle(record: TxRecord): string {
  switch (record.kind) {
    case 'shield':
    case 'shield-xchain': {
      // Shields carry the source chain they deposited/bridged from.
      const meta = record.meta as { fromChainId?: number }
      const chain = meta.fromChainId !== undefined ? getChainById(meta.fromChainId) : undefined
      return chain ? `Shield from ${chain.name}` : 'Shield'
    }
    case 'unshield-local':
    case 'unshield-xchain': {
      // Public unshields — external send + withdraw-to-own-wallet share this kind — carry the 0x recipient.
      const meta = record.meta as { recipient?: string }
      return meta.recipient ? `Sent to ${truncateAddress(meta.recipient)}` : 'Sent'
    }
    case 'transfer-shielded':
      // Private (0zk → 0zk) send. The recipient stays private, so we don't surface the address.
      return 'Sent to private address'
    case 'transfer-shielded-received':
      // Incoming private transfer — sender is private by design, so no address.
      return 'Received payment'
    case 'yield-deposit':
      return 'Added to earn vault'
    case 'yield-withdraw':
      return 'Withdrawn from earn vault'
    case 'consolidate': {
      // Chain-recovered merges carry no note counts, so the count is optional.
      const meta = record.meta as { notesMerged?: number }
      return meta.notesMerged !== undefined ? `Merged ${meta.notesMerged} notes` : 'Merged notes'
    }
  }
  // Defensive fallback for any future kind not covered above.
  return kindTitle(record.kind)
}
