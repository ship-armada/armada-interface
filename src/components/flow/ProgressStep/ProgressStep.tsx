// ABOUTME: Shared progress step — renders the active tx's <TxLifecycleStepper> for any TxKind.
// ABOUTME: When no record exists yet (user clicked Confirm but executor hasn't written the first transition), shows a preparing placeholder.

import type { TxRecord } from '@/lib/tx/types'
import { TxLifecycleStepper } from '@/components/tx'
import styles from './ProgressStep.module.css'

export interface ProgressStepProps {
  /** The in-flight tx record. Null when the executor hasn't created a record yet (e.g. user just clicked Confirm). */
  record: TxRecord | null
  /** Whether the technical-details disclosure starts open; reflects the user's preference at the page level. */
  technicalDetailsDefaultOpen?: boolean
}

export function ProgressStep({ record, technicalDetailsDefaultOpen }: ProgressStepProps) {
  if (!record) {
    return (
      <div className={styles.root}>
        <div className={styles.headline}>Preparing transaction</div>
        <div className={styles.sub}>Hang on a moment…</div>
      </div>
    )
  }
  return (
    <div className={styles.root}>
      <TxLifecycleStepper record={record} technicalDetailsDefaultOpen={technicalDetailsDefaultOpen} />
    </div>
  )
}
