// ABOUTME: Dashboard "In Progress" card — non-terminal TxRecords from pendingTxsAtom; one row per record with stage copy + progress strip.
// ABOUTME: Replaces the deprecated Account Status panel per the UI plan. Collapses to a quiet empty state when nothing is in flight.

import { useAtomValue } from 'jotai'
import { Activity } from 'lucide-react'
import { Card, EmptyState, SectionHeader } from '@/components/ui'
import { TxRow } from '@/components/tx'
import { pendingTxsAtom } from '@/state/tx'
import type { TxRecord } from '@/lib/tx/types'
import styles from './InProgressCard.module.css'

export interface InProgressCardProps {
  /** Called when a row is selected. Parent can open a detail modal or expand inline. */
  onSelect?: (record: TxRecord) => void
}

export function InProgressCard({ onSelect }: InProgressCardProps) {
  const rows = useAtomValue(pendingTxsAtom)

  return (
    <Card className={styles.card}>
      <SectionHeader title="In progress" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Activity size={28} />}
          title="All quiet"
          description="In-flight transactions will appear here."
        />
      ) : (
        <ul className={styles.list}>
          {rows.map(record => (
            <li key={record.id}>
              <TxRow
                record={record}
                showStageCopy
                showProgress
                onClick={onSelect ? () => onSelect(record) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
