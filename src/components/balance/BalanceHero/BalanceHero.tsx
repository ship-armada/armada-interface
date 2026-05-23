// ABOUTME: Dashboard hero card — total private USDC, with "Available privately" + "Earning in vault" sub-balances.
// ABOUTME: Renders a syncing placeholder when shielded balance or yield shares are null (sync not finished); never shows $0 in that state.

import { useAtomValue } from 'jotai'
import { Card } from '@/components/ui'
import { formatUsdcAmount } from '@/lib/format'
import { sharesToUsdc } from '@/lib/yield'
import { shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'
import { useYieldRate } from '@/hooks/useYieldRate'
import styles from './BalanceHero.module.css'

export function BalanceHero() {
  const shielded = useAtomValue(shieldedUsdcAtom)
  const yieldShares = useAtomValue(yieldSharesAtom)
  const { rate: yieldRate } = useYieldRate()

  const earningUsdc =
    yieldShares !== null && yieldRate !== null
      ? sharesToUsdc(yieldShares, yieldRate.rate)
      : null

  // Total = shielded + yield (when yield is known). Treat unknown yield as 0 for the headline
  // so the total reflects what the user actually has access to right now; the breakdown row
  // below still shows "—" for yield until its own sync wires up.
  const total = shielded !== null ? shielded + (earningUsdc ?? 0n) : null

  // Pre-sync state — gates only on shielded (the canonical "do I have private USDC?" feed).
  // Yield sync is a separate pipeline; when it isn't wired the breakdown shows "—" and the
  // total simply omits the vault contribution.
  const isSyncing = shielded === null

  return (
    <Card variant="raised" className={styles.card}>
      <div className={styles.label}>Total private USDC</div>
      {isSyncing ? (
        <div className={styles.syncing}>Syncing private balance…</div>
      ) : (
        <div className={styles.totalRow}>
          <span className={styles.totalAmount}>
            {total !== null ? formatUsdcAmount(total) : '—'}
          </span>
          <span className={styles.totalUnit}>USDC</span>
        </div>
      )}

      <div className={styles.breakdown}>
        <div className={styles.breakdownItem}>
          <div className={styles.breakdownLabel}>Available privately</div>
          <div className={styles.breakdownValue}>
            {shielded === null ? '—' : formatUsdcAmount(shielded)}
          </div>
        </div>
        <div className={styles.breakdownDivider} aria-hidden="true" />
        <div className={styles.breakdownItem}>
          <div className={styles.breakdownLabel}>Earning in vault</div>
          <div className={styles.breakdownValue}>
            {earningUsdc === null ? '—' : formatUsdcAmount(earningUsdc)}
          </div>
        </div>
      </div>
    </Card>
  )
}
