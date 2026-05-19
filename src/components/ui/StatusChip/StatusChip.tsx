// ABOUTME: StatusChip primitive — small inline pill conveying a status with color-coded chrome and a leading dot.
// ABOUTME: Generic over status semantics — TxStatusChip wraps this with a TxExecutionState → variant mapping.

import styles from './StatusChip.module.css'

export type StatusChipVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error'

export interface StatusChipProps {
  label: string
  variant?: StatusChipVariant
  /** Whether to render a leading dot. Default true. */
  showDot?: boolean
  className?: string
}

export function StatusChip({ label, variant = 'neutral', showDot = true, className }: StatusChipProps) {
  const cls = [styles.chip, styles[variant], className].filter(Boolean).join(' ')
  return (
    <span className={cls} role="status">
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span className={styles.label}>{label}</span>
    </span>
  )
}
