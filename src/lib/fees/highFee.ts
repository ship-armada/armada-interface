// ABOUTME: Review's high-fee warning (5D): how large a share of the amount every fee the user loses is — a caution over
// ABOUTME: 10%, and over 25% a required "I understand" tick before Confirm. Pure.

/** `none` — nothing to say; `caution` — over 10%, a warning; `confirm` — over 25%, the user must acknowledge it. */
export type HighFeeLevel = 'none' | 'caution' | 'confirm'

/** Over this share of the amount, Review warns. */
const CAUTION_SHARE_BPS = 1_000n
/** Over this share, Review also asks the user to acknowledge before Confirm. */
const CONFIRM_SHARE_BPS = 2_500n

/** `fees` = every fee the user loses on this tx (relayer + protocol + CCTP), `amount` = what they typed. */
export function highFeeLevel(fees: bigint | null, amount: bigint): HighFeeLevel {
  if (fees === null || fees <= 0n || amount <= 0n) return 'none'
  // Compare fees / amount against the thresholds in basis points, in integers (no float rounding at the boundary).
  const scaled = fees * 10_000n
  if (scaled > CONFIRM_SHARE_BPS * amount) return 'confirm'
  if (scaled > CAUTION_SHARE_BPS * amount) return 'caution'
  return 'none'
}

/** The fees as a whole percent of the amount, for the warning's copy. */
export function feePercent(fees: bigint, amount: bigint): number {
  if (amount <= 0n) return 0
  return Math.round(Number((fees * 10_000n) / amount) / 100)
}
