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
  const yieldRate = useYieldRate()

  const earningUsdc =
    yieldShares !== null && yieldRate !== null
      ? sharesToUsdc(yieldShares, yieldRate.rate)
      : null

  // Total includes vault balance — only computable when both feeds resolved.
  const total =
    shielded !== null && earningUsdc !== null ? shielded + earningUsdc : null

  // Pre-sync state — we deliberately never show 0; an empty/zero balance is itself a sync-complete answer.
  const isSyncing = shielded === null || yieldShares === null

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
