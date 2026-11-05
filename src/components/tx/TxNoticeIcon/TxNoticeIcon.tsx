// ABOUTME: TxNoticeIcon — the glyph for a tx notice's tone (spinner while pending, check when it settled, arrow for a
// ABOUTME: payment received, cross on failure, warning when the outcome is unknown). Shared by the toast and header pill.

import { ArrowDownLeftIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import type { TxNoticeTone } from '@/lib/tx/notices'
import styles from './TxNoticeIcon.module.css'

export function TxNoticeIcon({ tone }: { tone: TxNoticeTone }) {
  switch (tone) {
    case 'pending':
      return <span className={styles.spinner} aria-hidden />
    case 'success':
      return <CheckCircleIcon className={`${styles.icon} ${styles.success}`} strokeWidth={1.75} aria-hidden />
    case 'received':
      return <ArrowDownLeftIcon className={`${styles.icon} ${styles.received}`} strokeWidth={1.75} aria-hidden />
    case 'failure':
      return <XCircleIcon className={`${styles.icon} ${styles.failure}`} strokeWidth={1.75} aria-hidden />
    case 'uncertain':
      return <ExclamationTriangleIcon className={`${styles.icon} ${styles.uncertain}`} strokeWidth={1.75} aria-hidden />
  }
}
