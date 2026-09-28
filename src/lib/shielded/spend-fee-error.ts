// ABOUTME: SpendFeeIncreasedError — thrown when a spend's build (a split transfer, a consolidation) would charge
// ABOUTME: more than the fee the user reviewed. Leaf module (no imports) so the tx error classifier can match it.

/**
 * The build's fee exceeds the fee the user reviewed. A multi-proof spend (a fragmented wallet's split
 * transfer, a consolidation) pays the per-proof fee once per proof, and the proof count can change between
 * review and build (a sync moved the wallet's notes), so the builder refuses rather than charge more than
 * the user approved.
 */
export class SpendFeeIncreasedError extends Error {
  readonly code = 'SPEND_FEE_INCREASED'
  /** The total fee the user reviewed and approved. */
  readonly reviewedFee: bigint
  /** The total fee the build would now charge. */
  readonly totalFee: bigint
  constructor(reviewedFee: bigint, totalFee: bigint) {
    super(`spend fee rose from ${reviewedFee} to ${totalFee} since review`)
    this.name = 'SpendFeeIncreasedError'
    this.reviewedFee = reviewedFee
    this.totalFee = totalFee
  }
}
