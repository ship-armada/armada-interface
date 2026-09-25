// ABOUTME: Merge-notes intent — which token to consolidate and, when a spend was blocked by fragmentation, the
// ABOUTME: spend to dry-run against the post-merge wallet. Built from a failed record; resolved to SDK requests.

import type { PlanTransferRequest } from '@armada/sdk'
import type { TxKind, TxRecord } from '@/lib/tx/types'

/** The shielded tokens this app merges: USDC and the yield-vault shares. */
export type MergeToken = 'usdc' | 'shares'

/** A spend that failed because the wallet's notes were too fragmented for its circuit shape. */
export interface BlockedSpend {
  readonly kind: TxKind
  /** In the merged token's units (vault shares for a withdrawal, USDC otherwise). */
  readonly amount: bigint
  /** The private (0zk) recipient of a blocked private send. */
  readonly recipient?: string
  /** The relayer's per-proof fee the spend pays in a fee note (0 when it has none). */
  readonly perProofFee: bigint
}

/** What the merge flow opens with: the token to merge, and the spend it's meant to unblock (if any). */
export interface MergeIntent {
  readonly token: MergeToken
  readonly blocked?: BlockedSpend
}

/**
 * The merge that would unblock a failed spend, read from its record: the token it spends and what it
 * tried to do. Null for kinds that don't spend shielded notes (shields, received transfers, merges).
 */
export function mergeIntentFromRecord(record: TxRecord): MergeIntent | null {
  switch (record.kind) {
    case 'transfer-shielded': {
      const meta = (record as TxRecord<'transfer-shielded'>).meta
      return {
        token: 'usdc',
        blocked: {
          kind: record.kind,
          amount: meta.amount,
          recipient: meta.recipient,
          perProofFee: meta.broadcasterFeePerProof ?? meta.broadcasterFeeAmount,
        },
      }
    }
    case 'unshield-local':
    case 'unshield-xchain':
    case 'yield-deposit': {
      const meta = (record as TxRecord<'unshield-local' | 'unshield-xchain' | 'yield-deposit'>).meta
      return { token: 'usdc', blocked: { kind: record.kind, amount: meta.amount, perProofFee: meta.broadcasterFeeAmount } }
    }
    case 'yield-withdraw': {
      // A redeem spends vault shares and pays its fee contract-side, so its proof has no fee note.
      const meta = (record as TxRecord<'yield-withdraw'>).meta
      return { token: 'shares', blocked: { kind: record.kind, amount: meta.shares, perProofFee: 0n } }
    }
    default:
      return null
  }
}

/** Any EVM address: the dry run only needs the unshield's value, not where it goes. */
const DRY_RUN_UNSHIELD_RECIPIENT = '0x0000000000000000000000000000000000000001' as const

/**
 * The SDK request to dry-run a blocked spend with (`wallet.planTransferAfter`). It reproduces the spend's
 * circuit SHAPE — the same inputs selected for the same value and outputs — not its destination: every
 * blocked non-transfer spend is an unshield (plus fee and change), so its adapter / CCTP binding can be
 * left out. The fee schedule only needs the `transfer` tier: the SDK falls back to it for any spend kind.
 */
export function blockedSpendRequest(blocked: BlockedSpend, tokenAddress: `0x${string}`): PlanTransferRequest {
  const fee = { schedule: { transfer: blocked.perProofFee.toString() }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 }
  if (blocked.kind === 'transfer-shielded') {
    return { outputs: [{ to0zk: blocked.recipient ?? '', amount: blocked.amount }], fee, tokenAddress }
  }
  return { outputs: [], unshield: { recipient: DRY_RUN_UNSHIELD_RECIPIENT, amount: blocked.amount }, fee, tokenAddress }
}

/** The merged token's display name. */
export function mergeTokenSymbol(token: MergeToken): string {
  return token === 'shares' ? 'Vault shares' : 'USDC'
}

/** The blocked action in plain words, for "your <action> will go through". */
export function blockedActionLabel(kind: TxKind): string {
  switch (kind) {
    case 'transfer-shielded':
      return 'send'
    case 'yield-deposit':
      return 'vault deposit'
    case 'yield-withdraw':
      return 'vault withdrawal'
    default:
      // Public sends and withdrawals to your own wallet are both unshields.
      return 'withdrawal'
  }
}

/**
 * From this many notes a token is worth offering to merge: unshields, withdrawals and vault ops have no
 * circuit above 4 input notes, so a balance spread over 5+ notes can already block them.
 */
export const MERGE_SUGGEST_NOTE_COUNT = 5
