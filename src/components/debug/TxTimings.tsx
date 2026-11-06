// ABOUTME: Debug-page "Tx timings" table — p50 / p90 per kind and stage (from completed records' stage stamps and this
// ABOUTME: session's balance-lag and sign-in → balance samples, lib/tx/timings), in seconds, with "Copy" to share it as plain text.

import { Button } from '@/design'
import type { TimingRow } from '@/lib/tx/timings'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import styles from './TxTimings.module.css'

export interface TxTimingsProps {
  rows: readonly TimingRow[]
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function asText(rows: readonly TimingRow[]): string {
  const lines = rows.map((r) => [r.kind, r.stage, String(r.samples), seconds(r.p50), seconds(r.p90)].join('\t'))
  return ['kind\tstage\tn\tp50\tp90', ...lines].join('\n')
}

export function TxTimings({ rows }: TxTimingsProps) {
  const { copied, copy } = useCopyToClipboard()
  if (rows.length === 0) {
    return <p className={styles.empty}>No completed transactions with timings yet — run a few, then come back.</p>
  }
  return (
    <div className={styles.root}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Stage</th>
            <th>n</th>
            <th>p50</th>
            <th>p90</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}:${r.stage}`}>
              <td>{r.kind}</td>
              <td>{r.stage}</td>
              <td>{r.samples}</td>
              <td>{seconds(r.p50)}</td>
              <td>{seconds(r.p90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <Button
          variant="secondary"
          size="sm"
          showIcon={false}
          label={copied ? 'Copied' : 'Copy'}
          onClick={() => void copy(asText(rows))}
        />
      </div>
    </div>
  )
}
