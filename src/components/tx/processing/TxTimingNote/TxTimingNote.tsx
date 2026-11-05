// ABOUTME: TxTimingNote — the slow-stage callout under the progress stepper: "Taking longer than usual" + what's safe (the
// ABOUTME: warning callout style — raised surface, amber edge + icon — not an error). The normal state is the stepper's chip.

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { StageTimingNote } from '@/lib/tx/eta'
import styles from './TxTimingNote.module.css'

export function TxTimingNote({ note }: { note: StageTimingNote | null }) {
  if (note?.kind !== 'slow') return null
  return (
    <div className={styles.callout} role="status" aria-live="polite">
      <span className={styles.iconTile} aria-hidden>
        <ExclamationTriangleIcon className={styles.icon} strokeWidth={1.75} />
      </span>
      <div className={styles.copy}>
        <p className={styles.title}>{note.title}</p>
        <p className={styles.body}>{note.body}</p>
      </div>
    </div>
  )
}
