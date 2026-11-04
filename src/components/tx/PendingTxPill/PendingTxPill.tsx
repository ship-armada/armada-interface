// ABOUTME: PendingTxPill — the header's "N Pending" pill beside the wallet button while txs are in flight: a spinner and
// ABOUTME: the count, on the same surface as the other header controls. Click opens the activity. Can announce a tx notice.

import { XMarkIcon } from '@heroicons/react/24/outline'
import type { TxNoticeTone } from '@/lib/tx/notices'
import { TxNoticeIcon } from '@/components/tx/TxNoticeIcon'
import { noticeNeedsAttention } from '@/components/tx/TxNoticeToast'
import styles from './PendingTxPill.module.css'

export interface PendingTxPillProps {
  /** In-flight txs for the active wallet. */
  count: number
  onOpen: () => void
  /**
   * A tx notice to announce in place of the count (the "pill" notice style) — shown even when nothing is pending,
   * e.g. "Sent 5.00 USDC" once the last tx settles. The caller decides how long it stays.
   */
  announcement?: { tone: TxNoticeTone; title: string } | null
  /** Opens the announced tx (its receipt). */
  onAnnouncementOpen?: () => void
  /** Clears an announcement that stays up until acted on (a failure or unknown outcome). */
  onAnnouncementDismiss?: () => void
}

export function PendingTxPill({
  count,
  onOpen,
  announcement = null,
  onAnnouncementOpen,
  onAnnouncementDismiss,
}: PendingTxPillProps) {
  if (announcement) {
    const attention = noticeNeedsAttention(announcement.tone)
    return (
      <span className={`${styles.pill} ${styles.announcing}`}>
        <button
          type="button"
          className={styles.announcementButton}
          onClick={onAnnouncementOpen}
          aria-label={`${announcement.title} — ${attention ? 'view details' : 'view'}`}
        >
          <TxNoticeIcon tone={announcement.tone} />
          <span className={styles.announcementTitle}>{announcement.title}</span>
          {attention ? <span className={styles.announcementAction}>View details</span> : null}
        </button>
        {attention ? (
          <button type="button" className={styles.dismissButton} onClick={onAnnouncementDismiss} aria-label="Dismiss">
            <XMarkIcon className={styles.dismissIcon} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </span>
    )
  }
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
