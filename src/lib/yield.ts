// ABOUTME: Pure yield-math helpers (no React, no IO) — shares→USDC, APY from the vault rate, and the APY display formats shared by the dashboard and Earn flow.
// ABOUTME: Also the yield explanations: apyExplanation (the rate, net of the vault fee) and projectedYearlyYield (+ its ⓘ) for a deposit.

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

/**
 * The one display format for an APY percentage (e.g. 4.2 → "4.20%"), shared by every surface that
 * shows the vault rate — the dashboard vault bar and earn banner, the Earn modal, its review and the
 * activity receipt — so the same number never reads differently in two places. Callers add their own
 * "~" / "Earn … APY" framing.
 */
export function formatApyPercent(apy: number): string {
  return `${apy.toFixed(2)}%`
}

/** The earn banner headline ("Earn ~4.20% APY") — shared by the dashboard banner and the Earn modal's intro banner. */
export function formatEarnApyHeadline(apy: number): string {
  return `Earn ~${formatApyPercent(apy)} APY`
}

/** A basis-point fee as a short percentage: 1000 → "10%", 1250 → "12.5%". */
export function formatFeePercent(feeBps: bigint): string {
  const pct = Number(feeBps) / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, '')}%`
}

/**
 * What the vault's rate is (12C) — the ⓘ on the dashboard and Earn banners. The rate is the Aave market's current yearly
 * yield less the vault's fee on earnings (`useYieldRate().rate.yieldFeeBps`); while the fee isn't known the sentence
 * leaves its number out.
 */
export function apyExplanation(yieldFeeBps: bigint | undefined): string {
  const fee = yieldFeeBps !== undefined ? `${formatFeePercent(yieldFeeBps)} ` : ''
  return `Current yearly rate after the vault\u2019s ${fee}fee on earnings, as determined by the Aave market.`
}

/** The ⓘ beside a projected yearly yield (12E): it's today's rate, which moves with the market. */
export const PROJECTED_YIELD_EXPLANATION = 'At today\u2019s rate; rate changes with Aave market demand.'

/**
 * What a deposit of `amount` (raw 6-decimal USDC) would earn in a year at the net rate `apyBps` (12E) — simple interest,
 * no compounding: a rough guide, shown as "≈" with PROJECTED_YIELD_EXPLANATION. Spec YD-7.
 */
export function projectedYearlyYield(amount: bigint, apyBps: bigint): bigint {
  return (amount * apyBps) / 10_000n
}
