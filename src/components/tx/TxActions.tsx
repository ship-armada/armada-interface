// ABOUTME: Per-record retry/cancel CTAs. Rendered inside History's expanded detail and inside ProgressStep (cancel only).
// ABOUTME: Operates on TxRecord directly — no `useTx` subscription needed, calls executor module functions by id.

import { Button } from '@armada/ui'
import { cancelTx, canRetryTx, retryTx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'
import styles from './TxActions.module.css'

export interface TxActionsProps {
  record: TxRecord
  /**
   * Subset of buttons to render. Default `'both'` shows Cancel + Retry depending on state.
   * Modals' Progress step uses `'cancel'` since they handle Retry via the dedicated ErrorStep.
   */
  variant?: 'both' | 'cancel'
}

const PRE_TERMINAL_STATES = new Set(['pending', 'active', 'waiting', 'retrying'])

export function TxActions({ record, variant = 'both' }: TxActionsProps) {
  const isInFlight = PRE_TERMINAL_STATES.has(record.executionState)
  const canRetry = variant === 'both' && canRetryTx(record)

  // Nothing to show on completed records — no Cancel (already done), no Retry (lifecycle finished).
  if (!isInFlight && !canRetry) return null

  return (
    <div className={styles.row}>
      {isInFlight ? (
        <Button
          variant="secondary"
          size="sm"
          showIcon={false}
          label="Cancel"
          onClick={() => cancelTx(record.id)}
        />
      ) : null}
      {canRetry ? (
        <Button
          variant="secondary"
          size="sm"
          showIcon={false}
          label="Retry"
          onClick={() => retryTx(record.id)}
        />
      ) : null}
    </div>
  )
}
