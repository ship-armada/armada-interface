// ABOUTME: FirstSendNotice — the Send review's warning callout for a recipient the user has never sent to, when a
// ABOUTME: mistyped or lookalike address is likeliest. Styled like MergeNotesNotice / FeeUpdatedBanner (warning accent).

import { useId } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import styles from './FirstSendNotice.module.css'

export function FirstSendNotice() {
  const titleId = useId()
  return (
    <div className={styles.notice} role="note" aria-labelledby={titleId}>
      <span className={styles.iconTile} aria-hidden>
        <ExclamationTriangleIcon className={styles.icon} strokeWidth={1.75} />
      </span>
      <div className={styles.copy}>
        <p id={titleId} className={styles.title}>New recipient</p>
        <p className={styles.body}>You haven't sent to this address before. Check it carefully.</p>
      </div>
    </div>
  )
}
