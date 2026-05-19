// ABOUTME: Compact row representation of a TxRecord — title + amount + relative timestamp + TxStatusChip.
// ABOUTME: Optional sub-line with the current stage copy + a thin progress bar for InProgressCard use.

import { lifecycleFor } from '@/lib/tx/lifecycles'
import { formatUsdc, formatRelativeTime } from '@/lib/format'
import type { TxRecord } from '@/lib/tx/types'
import { TxStatusChip } from './TxStatusChip'
import { stageCopy, recordTitle } from './stageCopy'
import styles from './TxRow.module.css'

export interface TxRowProps {
  record: TxRecord
  /**
   * Show the current stage copy as a sub-line beneath the title. Default false.
   * InProgressCard sets true; History list leaves false.
   */
  showStageCopy?: boolean
  /**
   * Render a thin progress bar showing stagesCompleted / total stages. Default false.
   * InProgressCard sets true; History list leaves false.
   */
  showProgress?: boolean
  onClick?: () => void
  className?: string
}

export function TxRow({
  record,
  showStageCopy = false,
  showProgress = false,
  onClick,
  className,
}: TxRowProps) {
  const lifecycle = lifecycleFor(record.kind)
  const cls = [styles.root, onClick ? styles.clickable : '', className].filter(Boolean).join(' ')

  const title = recordTitle(record)
  const subline =
    showStageCopy && (record.executionState === 'completed'
      ? null
      : stageCopy(record.kind, record.stage as string, record.executionState))

  const completedCount = record.stagesCompleted.length
  const stageCount = lifecycle.stages.length
  const progressTotal = stageCount
  const progressCurrent =
    record.executionState === 'completed' ? progressTotal : completedCount

  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cls}
    >
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          <span className={styles.amount}>{formatUsdc(record.meta.amount)}</span>
        </div>
        {showStageCopy && subline ? (
          <div className={styles.subline}>{subline}</div>
        ) : null}
        {showProgress ? (
          <div className={styles.progressRow}>
            <div className={styles.track}>
              {Array.from({ length: progressTotal }).map((_, i) => (
                <div
                  key={i}
                  className={[styles.tick, i < progressCurrent ? styles.tickFilled : ''].filter(Boolean).join(' ')}
                />
              ))}
            </div>
            <span className={styles.progressCount}>
              {progressCurrent}/{progressTotal}
            </span>
          </div>
        ) : null}
      </div>
      <div className={styles.meta}>
        <TxStatusChip state={record.executionState} />
        <span className={styles.time}>{formatRelativeTime(record.updatedAt)}</span>
      </div>
    </Tag>
  )
}
