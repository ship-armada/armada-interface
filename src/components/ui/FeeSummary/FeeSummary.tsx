// ABOUTME: FeeSummary — "Estimated fee" + "You'll receive/deposit" two-line panel for action flow input/review steps.
// ABOUTME: Generic: caller provides the fee (or null while loading) and net amount; FeeSummary handles formatting + loading state.

import { formatUsdcAmount } from '@/lib/format'
import styles from './FeeSummary.module.css'

export interface FeeSummaryProps {
  /** Estimated fee in raw 6-decimal USDC. null while a quote is being fetched. */
  fee: bigint | null
  /** Net amount the user receives or has credited (after fees), in raw 6-decimal USDC. */
  netAmount: bigint
  /** Label for the net amount line. Defaults to "You'll receive". */
  netLabel?: string
  /** Label for the fee line. Defaults to "Estimated fee". */
  feeLabel?: string
  /** Whether the fee quote is currently being refreshed; shows a subtle "refreshing…" hint. */
  isRefreshing?: boolean
  className?: string
}

export function FeeSummary({
  fee,
  netAmount,
  netLabel = "You'll receive",
  feeLabel = 'Estimated fee',
  isRefreshing,
  className,
}: FeeSummaryProps) {
  const cls = [styles.root, className].filter(Boolean).join(' ')
  return (
    <dl className={cls}>
      <div className={styles.row}>
        <dt className={styles.label}>{feeLabel}</dt>
        <dd className={styles.value}>
          {fee === null ? (
            <span className={styles.loading}>Loading…</span>
          ) : fee === 0n ? (
            <span className={styles.zeroFee}>No fee</span>
          ) : (
            <>
              {formatUsdcAmount(fee)} <span className={styles.unit}>USDC</span>
            </>
          )}
          {isRefreshing && fee !== null && fee !== 0n ? (
            <span className={styles.refresh}> (refreshing)</span>
          ) : null}
        </dd>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.row}>
        <dt className={styles.label}>{netLabel}</dt>
        <dd className={styles.valueEmphasis}>
          {formatUsdcAmount(netAmount)} <span className={styles.unit}>USDC</span>
        </dd>
      </div>
    </dl>
  )
}
