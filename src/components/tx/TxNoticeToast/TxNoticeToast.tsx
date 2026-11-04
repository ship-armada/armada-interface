// ABOUTME: TxNoticeToast — a tx notice as a floating toast (rendered through sonner's toast.custom): tone icon, the title,
// ABOUTME: and "View" (or "View details" when something went wrong) to open the tx's receipt.

import type { TxNoticeTone } from '@/lib/tx/notices'
import { TxNoticeIcon } from '@/components/tx/TxNoticeIcon'
import styles from './TxNoticeToast.module.css'

export interface TxNoticeToastProps {
  tone: TxNoticeTone
  title: string
  onView: () => void
}

/** Something went wrong (or may have) — the action invites a closer look. */
export function noticeNeedsAttention(tone: TxNoticeTone): boolean {
  return tone === 'failure' || tone === 'uncertain'
}

export function TxNoticeToast({ tone, title, onView }: TxNoticeToastProps) {
  return (
    <div className={styles.toast} role="status">
      <TxNoticeIcon tone={tone} />
      <span className={styles.title}>{title}</span>
      <button type="button" className={styles.action} onClick={onView}>
        {noticeNeedsAttention(tone) ? 'View details' : 'View'}
      </button>
    </div>
  )
}
