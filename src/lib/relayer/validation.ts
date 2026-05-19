// ABOUTME: Fee quote sanity check — absolute + ratio bounds against the tx amount. No external price oracle.
// ABOUTME: Catches decimal bugs, stale relayer cache, catastrophic config mistakes. Reviewer rec #6 (simplified — no HTTP).

/**
 * Validation outcome for a fee quote against a tx amount.
 *  - 'ok'    — within both absolute and ratio bounds
 *  - 'warn'  — exceeds the warning ratio (> 5% of amount); UI should surface a notice
 *  - 'block' — exceeds the blocking ratio (> 25%) or the absolute cap; submission should refuse
 */
export type FeeValidation = 'ok' | 'warn' | 'block'

/** Absolute ceiling on a single quoted fee — 100 USDC raw (6 decimals). */
export const HARD_ABSOLUTE_USDC_CAP = 100_000_000n

/** Fee-to-amount ratios expressed as percentages over 100. */
const WARN_RATIO_NUM = 5n
const BLOCK_RATIO_NUM = 25n
const RATIO_DEN = 100n

/**
 * Sanity-check a fee quote against the tx amount. Pure function, no IO.
 *
 *  - `feeRaw` and `amountRaw` are USDC raw units (6 decimals).
 *  - `amountRaw` of 0n is treated as "no ratio check applies" — only the
 *    absolute cap matters (e.g. a balance read fee that doesn't correspond
 *    to a transfer).
 */
export function validateFeeQuote(feeRaw: bigint, amountRaw: bigint): FeeValidation {
  if (feeRaw < 0n) return 'block'
  if (feeRaw > HARD_ABSOLUTE_USDC_CAP) return 'block'
  if (amountRaw <= 0n) return 'ok'
  if (feeRaw * RATIO_DEN > amountRaw * BLOCK_RATIO_NUM) return 'block'
  if (feeRaw * RATIO_DEN > amountRaw * WARN_RATIO_NUM) return 'warn'
  return 'ok'
}
