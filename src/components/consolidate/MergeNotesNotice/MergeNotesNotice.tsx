// ABOUTME: MergeNotesNotice — the review/complete-step callout for a wallet too fragmented for an action: warning
// ABOUTME: icon, title + one line of copy, and the merge action on its own row. Styled like the FeeUpdatedBanner.

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Button } from '@/design'
import styles from './MergeNotesNotice.module.css'

export interface MergeNotesNoticeProps {
  title?: string
  body?: string
  actionLabel?: string
  onAction: () => void
}

export function MergeNotesNotice({
  title = 'Too many small notes',
  body = 'Your balance is spread across more small notes than this transaction can use. Merge them first, then continue.',
  actionLabel = 'Merge notes',
  onAction,
}: MergeNotesNoticeProps) {
  return (
    <div className={styles.notice} role="status" aria-live="polite">
      <span className={styles.iconTile} aria-hidden>
        <ExclamationTriangleIcon className={styles.icon} strokeWidth={1.75} />
      </span>
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{body}</p>
        <div className={styles.action}>
          <Button variant="secondary" size="sm" label={actionLabel} showIcon={false} onClick={onAction} />
        </div>
      </div>
    </div>
  )
}
