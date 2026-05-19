// ABOUTME: Shared progress step — renders the active tx's lifecycle stepper for any TxKind.
// ABOUTME: Stub until <TxLifecycleStepper> ships in components/tx/; for now renders kind + stage + executionState placeholders.

import type { TxRecord } from '@/lib/tx/types'
import styles from './ProgressStep.module.css'

export interface ProgressStepProps {
  /** The in-flight tx record. Null when the executor hasn't created a record yet (e.g. user just clicked Confirm). */
  record: TxRecord | null
}

export function ProgressStep({ record }: ProgressStepProps) {
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
      <div className={styles.headline}>Transaction in progress</div>
      <dl className={styles.facts}>
        <div>
          <dt>Kind</dt>
          <dd>{record.kind}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{record.stage}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>{record.executionState}</dd>
        </div>
      </dl>
      <div className={styles.note}>
        TxLifecycleStepper will replace this stub when components/tx/ lands.
      </div>
    </div>
  )
}
