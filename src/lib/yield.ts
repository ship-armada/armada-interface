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
 * Convert annual yield basis points to a percentage number (e.g. 500n → 5).
 *
 * Input comes from `useYieldRate().rate.apyBps`, which is the spoke's gross annualYieldBps
 * reduced by the vault's `yieldFeeBps` — i.e. the user's net realised APY. We return a plain
 * Number because the call sites just format to "~X.XX%" for display; precision beyond two
 * decimal places isn't meaningful for an estimate.
 */
export function rateToApy(apyBps: bigint): number {
  return Number(apyBps) / 100
}
