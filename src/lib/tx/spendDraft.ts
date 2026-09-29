// ABOUTME: spendDraft — the record a private send or unshield review will submit, built once from the reviewed figures and
// ABOUTME: shared by the Review step (rendered through txFigures) and the submit, so the stored record is what Review showed.

import type { TxDraft } from './types'

export type SpendKind = 'transfer-shielded' | 'unshield-local' | 'unshield-xchain'

export interface SpendDraftInput {
  amount: bigint
  recipient: string
  /** Destination chain — carried by a cross-chain unshield only. */
  toChainId: number
  /** The planned total relayer fee across every proof. */
  fee: bigint
  /** The relayer's quoted per-proof fee the build re-plans at. */
  perProofFee: bigint
  /** The protocol unshield fee shown at review (0 → not recorded). Unshields only. */
  protocolFee: bigint
  /** The CCTP fast-fee estimate shown at review (0 → not recorded). Cross-chain unshields only. */
  cctpFee: bigint
  feeCacheId: string
  broadcasterShieldedAddress: string
}

/**
 * The meta a Send / Unshield review will submit for `kind`: the amount, the recipient, the planned relayer fee and,
 * where the kind carries them, the protocol and CCTP fees shown at review — so the receipt reports the full fee.
 */
export function spendDraft<K extends SpendKind>(kind: K, input: SpendDraftInput): TxDraft<K> {
  const common = {
    amount: input.amount,
    feeCacheId: input.feeCacheId,
    recipient: input.recipient,
    // The approved total across every proof, and the per-proof fee the build re-plans at.
    broadcasterFeeAmount: input.fee,
    broadcasterFeePerProof: input.perProofFee,
    broadcasterShieldedAddress: input.broadcasterShieldedAddress,
  }
  const protocolFee = input.protocolFee > 0n ? { protocolFee: input.protocolFee } : {}
  switch (kind) {
    case 'transfer-shielded':
      return { kind: 'transfer-shielded', meta: common } as TxDraft<K>
    case 'unshield-local':
      return { kind: 'unshield-local', meta: { ...common, ...protocolFee } } as TxDraft<K>
    default:
      return {
        kind: 'unshield-xchain',
        meta: {
          ...common,
          toChainId: input.toChainId,
          ...protocolFee,
          // An estimate until the actual fee is known at delivery.
          ...(input.cctpFee > 0n ? { cctpFee: input.cctpFee, cctpFeeIsEstimate: true } : {}),
        },
      } as TxDraft<K>
  }
}
