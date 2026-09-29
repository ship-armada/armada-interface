// ABOUTME: deliveredShieldMeta — what a cross-chain shield's record takes from its hub delivery (the CCTP MessageReceived):
// ABOUTME: the true deposit (the burn amount) and Circle's actual CCTP fee, replacing the review-time estimate.

import type { CctpReceiptInfo } from '@/lib/cctp'
import type { MetaShieldXchain } from '@/lib/tx/types'

/**
 * The meta a cross-chain shield reconciles to from its hub delivery. The actual CCTP fee (`feeExecuted`) replaces the
 * review-time estimate and clears its est. marker; a field the delivery doesn't carry is left out, so the record keeps
 * its estimate (still marked) — a later rescan recovers the actual.
 */
export function deliveredShieldMeta(info: CctpReceiptInfo): Partial<MetaShieldXchain> {
  return {
    ...(info.received?.burnAmount !== undefined ? { amount: info.received.burnAmount } : {}),
    ...(info.received?.cctpFee !== undefined ? { cctpFee: info.received.cctpFee, cctpFeeIsEstimate: false } : {}),
  }
}
