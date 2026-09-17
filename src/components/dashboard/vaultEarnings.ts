// ABOUTME: Vault earnings helpers — APY constant, earning labels, and accrued-yield derivation for the vault bar.
// ABOUTME: Ported from the armada-app design mockup (pages/earnFlowConstants.ts).
import { formatUsdcAmount } from '@/components/dashboard/dashboardFormat'
import type { TxRecord } from '@/lib/tx/types'

/** Demo vault APY — matches BalanceCard ellipses menu meta. */
export const DEMO_EARN_APY = 4.2

export function formatVaultEarningLabel(apy: number): string {
  return `Earning ${apy.toFixed(1)}% APR`
}

export function formatEarnedSoFarAmount(value: number): string {
  if (value <= 0) return '+0'
  return `+${formatUsdcAmount(value)}`
}

/**
 * Accrued vault yield (raw 6-dp USDC) = current vault value − net capital contributed. Net contributed
 * is the user's own settled `yield-deposit` principal minus `yield-withdraw` gross (`meta.amount` on
 * each), so this is the position's total gain (market value − net cost) — clamped to ≥ 0 so a
 * rounding/rate wobble can't paint a negative "earned".
 *
 * Depends on complete history: only `completed` records count, and the caller must gate display on
 * history recovery having settled (a mid-recovery or failed scan would under-count deposits and
 * over-state the gain). Deposits and withdrawals move `vaultValue` and `netContributed` together, so
 * this figure stays stable across principal flows — it only tracks yield.
 */
export function accruedVaultYieldRaw(records: readonly TxRecord[], vaultValueRaw: bigint): bigint {
  let netContributed = 0n
  for (const r of records) {
    if (r.executionState !== 'completed') continue
    if (r.kind === 'yield-deposit') netContributed += r.meta.amount
    else if (r.kind === 'yield-withdraw') netContributed -= r.meta.amount
  }
  const earned = vaultValueRaw - netContributed
  return earned > 0n ? earned : 0n
}
