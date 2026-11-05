// ABOUTME: HighFeeNotice — Review's warning when fees are a large share of the amount (5D): the percentage, and past the
// ABOUTME: confirm threshold an "I understand" tick the Review step holds Confirm for. Warning-callout style, as MergeNotesNotice.

import { useId } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { HighFeeLevel } from '@/lib/fees/highFee'
import styles from './HighFeeNotice.module.css'

export interface HighFeeNoticeProps {
  level: HighFeeLevel
  /** The fees as a whole percent of the amount. */
  percent: number
  acknowledged: boolean
  onAcknowledge: (acknowledged: boolean) => void
}

export function HighFeeNotice({ level, percent, acknowledged, onAcknowledge }: HighFeeNoticeProps) {
  const titleId = useId()
  if (level === 'none') return null
  return (
    <div className={styles.notice} role="note" aria-labelledby={titleId}>
      <span className={styles.iconTile} aria-hidden>
        <ExclamationTriangleIcon className={styles.icon} strokeWidth={1.75} />
      </span>
      <div className={styles.copy}>
        <p id={titleId} className={styles.title}>High fees for this amount</p>
        <p className={styles.body}>Fees are {percent}% of this amount. A larger amount spreads them further.</p>
        {level === 'confirm' ? (
          <label className={styles.acknowledge}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} />
            I understand the fees are more than a quarter of this amount
          </label>
        ) : null}
      </div>
    </div>
  )
}
