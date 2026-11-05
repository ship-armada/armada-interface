// ABOUTME: TxCancelButton — "Cancel" under the live progress view (flow modal and Activity receipt) while a spend can still
// ABOUTME: be cancelled safely (lib/tx/cancelable: building its proof, nothing sent). Calls the executor's cancelTx.

import { Button } from '@/design'
import { cancelTx, getIsLeader } from '@/lib/tx/executor'
import { canCancelBeforeBroadcast } from '@/lib/tx/cancelable'
import type { TxRecord } from '@/lib/tx/types'
import styles from './TxCancelButton.module.css'

export function TxCancelButton({ record }: { record: TxRecord }) {
  // Follower tabs don't run txs — a cancel there would race the leader (see TxActions).
  if (!getIsLeader() || !canCancelBeforeBroadcast(record)) return null
  return (
    <div className={styles.row}>
      <Button variant="secondary" size="sm" showIcon={false} label="Cancel" onClick={() => cancelTx(record.id)} />
    </div>
  )
}
