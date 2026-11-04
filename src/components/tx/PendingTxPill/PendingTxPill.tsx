// ABOUTME: PendingTxPill — the header's "N Pending" pill beside the wallet button while txs are in flight: a spinner and
// ABOUTME: the count, on the same surface as the other header controls. Click opens the activity. Hidden at zero.

import styles from './PendingTxPill.module.css'

export interface PendingTxPillProps {
  /** In-flight txs for the active wallet. */
  count: number
  onOpen: () => void
}

export function PendingTxPill({ count, onOpen }: PendingTxPillProps) {
  if (count <= 0) return null
  const noun = count === 1 ? 'transaction' : 'transactions'
  return (
    <button
      type="button"
      className={styles.pill}
      onClick={onOpen}
      aria-label={`${count} ${noun} pending — view activity`}
    >
      <span className={styles.spinner} aria-hidden />
      <span>{count} Pending</span>
    </button>
  )
}
