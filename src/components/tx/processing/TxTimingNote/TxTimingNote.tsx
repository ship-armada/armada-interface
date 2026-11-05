// ABOUTME: TxTimingNote — the progress view's line under the stepper: how long the current stage usually takes, "Taking
// ABOUTME: longer than usual" (amber icon, not an error) once it's slow, and "Your USDC is safe in transit" while bridging.

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { StageTimingNote } from '@/lib/tx/eta'
import styles from './TxTimingNote.module.css'

export function TxTimingNote({ note }: { note: StageTimingNote | null }) {
  if (!note) return null
  return (
    <div className={styles.note} data-slow={note.slow} aria-live="polite">
      {note.hint ? (
        <p className={note.slow ? styles.slow : styles.hint}>
          {note.slow ? <ExclamationTriangleIcon className={styles.slowIcon} strokeWidth={1.75} aria-hidden /> : null}
          <span>{note.hint}</span>
        </p>
      ) : null}
      {note.reassurance ? <p className={styles.reassurance}>{note.reassurance}</p> : null}
    </div>
  )
}
