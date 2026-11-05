// ABOUTME: The proof ring's fill — the SDK's real checkpoints (0 / 50 / 100% per proof, across all of a spend's proofs),
// ABOUTME: eased forward at the measured pace between them, but never past the next checkpoint it hasn't reported (2B).

import type { TxRecord } from './types'

/** One proof's measured duration on Sepolia (Debug → Tx timings: build-proof p50 ~1.4–2.4s). */
export const PROOF_MS = 2_000

/** How far short of the next unreported checkpoint the easing stops, as a fraction of a checkpoint step. */
const CHECKPOINT_MARGIN = 0.1

/**
 * `real` is the last reported fraction (0..1, in the record's 10% buckets); `sinceMs` is how long ago it was reported.
 * Between checkpoints (every half proof) it moves at PROOF_MS per proof, stopping just short of the next one.
 */
export function easedProofProgress({ real, proofs, sinceMs }: { real: number; proofs: number; sinceMs: number }): number {
  if (real >= 1) return 1
  const step = 1 / (2 * Math.max(1, proofs))
  const next = Math.min(1, (Math.floor(real / step + 1e-9) + 1) * step)
  const eased = real + (Math.max(0, sinceMs) / (PROOF_MS / 2)) * step
  return Math.min(eased, next - step * CHECKPOINT_MARGIN)
}

/** How many proofs the spend runs: its total relayer fee over the per-proof fee (a split private send / merge), else 1. */
export function proofCount(record: TxRecord): number {
  const meta = record.meta as { broadcasterFeeAmount?: bigint; broadcasterFeePerProof?: bigint } | undefined
  const total = meta?.broadcasterFeeAmount
  const perProof = meta?.broadcasterFeePerProof
  if (total === undefined || perProof === undefined || perProof <= 0n) return 1
  return Math.max(1, Number(total / perProof))
}
