// ABOUTME: ReceiptProgress — a pending tx's live stepper in the Activity receipt. Eases in; when the tx settles it holds the
// ABOUTME: finished step for a moment, then collapses (a failure collapses at once). Instant under reduced motion.

import { useEffect, useState } from 'react'
import type { TxRecord } from '@/lib/tx/types'
import type { DashboardActivityStatus } from '@/components/dashboard/txActivityAdapter'
import { buildProcessingView } from '@/components/tx/processing/processingView'
import { TransactionProgressDisclosure } from '@/components/tx/processing/TransactionProgressDisclosure'
import { progressAnnouncement } from '@/components/tx/processing/processingCopy'
import { prefersReducedMotion } from '@/utils/motion'
import { TxTimingNote } from '@/components/tx/processing/TxTimingNote'
import { stageTimingNote } from '@/lib/tx/eta'
import { useNow } from '@/hooks/useNow'
import a11y from '@/design/styles/formA11y.module.css'
import styles from './ActivityReceipt.module.css'

/** Exit timings (ms) — the CSS in ActivityReceipt.module.css runs the matching collapse. */
export const RECEIPT_PROGRESS_MS = {
  /** A settled tx's finished step stays up this long, so it visibly completes… */
  hold: 600,
  /** …then the stepper fades and its height closes. */
  collapse: 220,
} as const

export interface ReceiptProgressProps {
  record: TxRecord
  /** The record's outcome bucket — `pending` shows the stepper; leaving `pending` plays the exit. */
  status: DashboardActivityStatus
}

type ExitPhase = 'holding' | 'leaving'

export function ReceiptProgress({ record, status }: ReceiptProgressProps) {
  const pending = status === 'pending'
  // The record as it settled, kept on screen through the exit.
  const [exit, setExit] = useState<{ record: TxRecord; phase: ExitPhase } | null>(null)
  const [wasPending, setWasPending] = useState(pending)

  // Leaving `pending` starts the exit in this same render (adjusting state while rendering), not in an effect after it:
  // an effect would leave one render with nothing to show, unmounting the stepper and replaying its entrance.
  if (pending !== wasPending) {
    setWasPending(pending)
    if (pending || prefersReducedMotion()) setExit(null)
    else setExit({ record, phase: status === 'settled' ? 'holding' : 'leaving' })
  }

  // Each exit phase runs for its time: a settled tx holds its finished step, then collapses, then goes.
  const exitPhase = exit?.phase ?? null
  useEffect(() => {
    if (exitPhase === null) return
    const timer = setTimeout(
      () => setExit((current) => (current && exitPhase === 'holding' ? { ...current, phase: 'leaving' } : null)),
      exitPhase === 'holding' ? RECEIPT_PROGRESS_MS.hold : RECEIPT_PROGRESS_MS.collapse,
    )
    return () => clearTimeout(timer)
  }, [exitPhase])

  const shown = pending ? record : exit?.record
  const progress = shown ? buildProcessingView(shown) : null
  // Re-read the clock once a second while the active stage has a timing estimate, so the note can turn "slow".
  const now = useNow(1_000, Boolean(progress?.timing))
  if (!shown || !progress) return null
  const phase = pending ? 'shown' : (exit?.phase ?? 'leaving')

  return (
    <div className={styles.progress} data-phase={phase}>
      <div className={styles.progressInner} inert={phase === 'leaving'}>
        <p className={a11y.srOnly} aria-live="polite" aria-atomic="true">
          {progressAnnouncement(progress.stages, progress.activeStageIndex, progress.completed)}
        </p>
        <TransactionProgressDisclosure
          stages={progress.stages}
          activeStageIndex={progress.activeStageIndex}
          completed={progress.completed}
        />
        <TxTimingNote note={progress.timing ? stageTimingNote(progress.timing, now) : null} />
      </div>
    </div>
  )
}
