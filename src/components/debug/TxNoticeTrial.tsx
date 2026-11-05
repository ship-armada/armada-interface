// ABOUTME: Debug-page tx-notice trial controls — pick how notices are presented (floating toasts / the header pill) and
// ABOUTME: fire sample notices (no real tx) to compare. Writes txNoticeStyleAtom and appends to txNoticeFeedAtom.

import { useAtom, useSetAtom } from 'jotai'
import { Button } from '@/design'
import type { TxKind, TxRecord } from '@/lib/tx/types'
import type { TxNoticeOutcome } from '@/lib/tx/notices'
import { txNoticeFeedAtom, txNoticeStyleAtom, type TxNoticeStyle } from '@/state/txNotices'
import { getNetworkConfig } from '@/config/network'
import styles from './TxNoticeTrial.module.css'

const STYLES: ReadonlyArray<{ value: TxNoticeStyle; label: string }> = [
  { value: 'toast', label: 'Toasts' },
  { value: 'pill', label: 'Header pill' },
]

// Outcomes only: a tx in flight is the header pill's job (from real pending txs), not a notice.
const SAMPLES: ReadonlyArray<{ label: string; tone: TxNoticeOutcome; kind: TxKind }> = [
  { label: 'Sent', tone: 'success', kind: 'transfer-shielded' },
  { label: 'Failed', tone: 'failure', kind: 'transfer-shielded' },
  { label: 'Received', tone: 'received', kind: 'transfer-shielded-received' },
  { label: 'Unknown', tone: 'uncertain', kind: 'shield' },
]

/**
 * A stand-in record for a sample notice: just what the notice copy reads (kind + a 5 USDC amount). It's never stored,
 * so "View" on a sample opens nothing.
 */
function sampleRecord(kind: TxKind, seq: number): TxRecord {
  const now = Date.now()
  return {
    id: `sample-${seq}`,
    kind,
    executionState: 'completed',
    stage: 'hub-confirmed',
    stagesCompleted: [],
    updatedSeq: 0,
    createdAt: now,
    updatedAt: now,
    meta: { amount: 5_000_000n, feeCacheId: '' },
    artifacts: {},
    walletContext: { shieldedWalletId: 'sample', sourceChainId: getNetworkConfig().hub.chainId },
  } as unknown as TxRecord
}

export function TxNoticeTrial() {
  const [style, setStyle] = useAtom(txNoticeStyleAtom)
  const setFeed = useSetAtom(txNoticeFeedAtom)

  function fireSample(tone: TxNoticeOutcome, kind: TxKind) {
    setFeed((feed) => {
      const seq = (feed[feed.length - 1]?.seq ?? 0) + 1
      return [...feed, { seq, tone, record: sampleRecord(kind, seq) }]
    })
  }

  return (
    <div className={styles.root}>
      <fieldset className={styles.styles}>
        <legend className={styles.legend}>Notice style</legend>
        {STYLES.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="tx-notice-style"
              value={option.value}
              checked={style === option.value}
              onChange={() => setStyle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className={styles.samples}>
        <span className={styles.legend}>Sample notice</span>
        <div className={styles.sampleButtons}>
          {SAMPLES.map((sample) => (
            <Button
              key={sample.label}
              variant="secondary"
              size="sm"
              showIcon={false}
              label={sample.label}
              onClick={() => fireSample(sample.tone, sample.kind)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
