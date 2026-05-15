// ABOUTME: Polls the ArmadaYieldVault's shares→assets exchange rate; refreshes on Aave events (debounced).
// ABOUTME: Stub: returns null. Implementation lands when yield is wired (per plan §11 polling matrix).

export interface YieldRate {
  /** Shares→USDC raw rate. 1 share = (rate / 1e18) USDC. */
  rate: bigint
  /** When this rate was observed (ms). */
  fetchedAt: number
}

export function useYieldRate(): YieldRate | null {
  return null
}
