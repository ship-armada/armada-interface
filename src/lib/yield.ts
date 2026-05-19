// ABOUTME: Pure yield-math helpers — shares→USDC conversion, APY derivation from the vault rate.
// ABOUTME: No React, no IO. BalanceHero uses sharesToUsdc; the Earn modal will use rateToApy when it lands.

/**
 * Convert raw 18-decimal yield shares to raw 6-decimal USDC, given a shares→USDC rate.
 *
 * Rate semantics: 1 share = (rate / 1e18) USDC; i.e. rate has 6-decimal USDC numerator and 18-decimal share denominator.
 * Math is done in bigint to avoid Number precision loss on large balances.
 */
export function sharesToUsdc(shares: bigint, rate: bigint): bigint {
  if (shares === 0n || rate === 0n) return 0n
  // shares (18d) * rate (USDC per share with 18d denominator → 6d USDC numerator) / 1e18
  return (shares * rate) / 1_000_000_000_000_000_000n
}

/**
 * Convert a per-second yield rate (in basis points, scaled by 1e18) to an annualized APY percentage.
 *
 * Placeholder: the actual rate source from `useYieldRate()` is per-share USDC, not a per-second growth rate.
 * Earn modal will refine this when the source is real. Exposed now so the call sites have a stable name.
 */
export function rateToApy(_secondsRate: bigint): number {
  // TODO: implement once useYieldRate returns the per-second growth rate. Today useYieldRate is stubbed
  // and returns null, so this helper is unused — wiring the call site without the math lets us land
  // BalanceHero + the Earn modal scaffold without an Earn-blocker.
  return 0
}
