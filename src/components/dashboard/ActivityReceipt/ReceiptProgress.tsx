// ABOUTME: ReceiptProgress — a pending tx's live stepper in the Activity receipt. Eases in; when the tx settles it holds the
// ABOUTME: finished step for a moment, then collapses (a failure collapses at once). Instant under reduced motion.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TxRecord } from '@/lib/tx/types'
import type { DashboardActivityStatus } from '@/components/dashboard/txActivityAdapter'
import { buildProcessingView } from '@/components/tx/processing/processingView'
import { TransactionProgressDisclosure } from '@/components/tx/processing/TransactionProgressDisclosure'
import { progressAnnouncement } from '@/components/tx/processing/processingCopy'
import { prefersReducedMotion } from '@/utils/motion'
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
  const wasPendingRef = useRef(pending)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef({ record, status })
  latestRef.current = { record, status }

  useLayoutEffect(() => {
    const wasPending = wasPendingRef.current
    wasPendingRef.current = pending
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (pending) {
      setExit(null)
      return
    }
    if (!wasPending || prefersReducedMotion()) return
    const settled = latestRef.current
    const leave = () => {
      setExit({ record: settled.record, phase: 'leaving' })
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setExit(null)
      }, RECEIPT_PROGRESS_MS.collapse)
    }
    if (settled.status === 'settled') {
      setExit({ record: settled.record, phase: 'holding' })
      timerRef.current = setTimeout(leave, RECEIPT_PROGRESS_MS.hold)
    } else {
      leave()
    }
  }, [pending])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const shown = pending ? record : exit?.record
  if (!shown) return null
  const phase = pending ? 'shown' : (exit?.phase ?? 'leaving')
  const progress = buildProcessingView(shown)

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
      </div>
    </div>
  )
}
