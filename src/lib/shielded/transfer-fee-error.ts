// ABOUTME: TransferFeeIncreasedError — thrown when a transfer's build would charge more than the fee the
// ABOUTME: user reviewed. Leaf module (no imports) so the tx error classifier can match it without pulling the SDK.

/**
 * The build's fee exceeds the fee the user reviewed. A fragmented wallet pays the per-proof fee once per
 * proof, and the proof count can grow between review and build (a sync moved the wallet's notes), so the
 * builder refuses rather than charge more than the user approved.
 */
export class TransferFeeIncreasedError extends Error {
  readonly code = 'TRANSFER_FEE_INCREASED'
  /** The total fee the user reviewed and approved. */
  readonly reviewedFee: bigint
  /** The total fee the build would now charge. */
  readonly totalFee: bigint
  constructor(reviewedFee: bigint, totalFee: bigint) {
    super(`transfer fee rose from ${reviewedFee} to ${totalFee} since review`)
    this.name = 'TransferFeeIncreasedError'
    this.reviewedFee = reviewedFee
    this.totalFee = totalFee
  }
}
