// ABOUTME: A cross-chain unshield's delivery reconcile — Circle's actual CCTP fee (`feeExecuted`), known once the
// ABOUTME: destination mint lands, replaces the review-time estimate on the record (spec UN-2x, decision D4, #68).

import { readBurnMessage } from '@/lib/cctp'
import type { MetaUnshieldXchain } from '@/lib/tx/types'

/**
 * Circle's actual CCTP fee for a delivered cross-chain unshield: the relayer's delivery status reports it
 * (`feeExecuted`); the on-chain fallback reads it from the destination `MessageReceived`'s BurnMessage body.
 * Undefined when neither carries it (or it's malformed) — the record then keeps its estimate.
 */
export function deliveredCctpFee(delivery: { feeExecuted?: string; messageBody?: `0x${string}` }): bigint | undefined {
  if (delivery.feeExecuted !== undefined) {
    try {
      return BigInt(delivery.feeExecuted)
    } catch {
      return undefined
    }
  }
  if (delivery.messageBody !== undefined) return readBurnMessage(delivery.messageBody)?.feeExecuted
  return undefined
}

/**
 * The meta a delivered cross-chain unshield reconciles to: the actual CCTP fee, replacing the review-time estimate and
 * clearing its est. marker. An unknown fee leaves the estimate — still marked "≈" — on the record.
 */
export function deliveredUnshieldMeta(cctpFeeActual: bigint | undefined): Partial<MetaUnshieldXchain> {
  return cctpFeeActual !== undefined ? { cctpFee: cctpFeeActual, cctpFeeIsEstimate: false } : {}
}
