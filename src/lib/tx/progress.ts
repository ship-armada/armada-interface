// ABOUTME: Throttled writer for proof-generation progress — atom-only, no IDB. 10% buckets per write to avoid hammering the OCC sequence on every SDK callback.
// ABOUTME: Handlers wrap their SDK `onProgress` arg with `createProofProgressWriter(record)` so the UI stepper can render a bar under the active build-proof row.

import { getDefaultStore } from 'jotai'
import { upsertTxAtom } from '@/state/tx'
import type { TxKind, TxRecord } from './types'

/**
 * Build a throttled `onProgress` callback for a single proof-generation pass. Tracks the
 * latest record across writes (each upsert bumps `updatedSeq`); the caller passes the
 * initial record and the writer mutates a closed-over reference.
 *
 *   const onProgress = createProofProgressWriter(record)
 *   await generateUnshieldProof({ ..., onProgress })
 *
 * Bucket size = 10% so we write ~10 times per proof gen, not the hundreds of intermediate
 * callbacks the SDK can fire. The first bucket (0.1) lands quickly and gives the user
 * "something is happening" feedback within the first second or two.
 */
export function createProofProgressWriter<K extends TxKind>(
  initial: TxRecord<K>,
): (fraction: number) => void {
  const store = getDefaultStore()
  let liveRecord: TxRecord<K> = initial
  let lastBucket = -1
  return (fraction: number) => {
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction
    const bucket = Math.floor(clamped * 10)
    if (bucket === lastBucket) return
    lastBucket = bucket
    liveRecord = {
      ...liveRecord,
      artifacts: { ...liveRecord.artifacts, proofProgress: bucket / 10 },
      updatedSeq: liveRecord.updatedSeq + 1,
      updatedAt: Date.now(),
    }
    // Atom-only write — progress is ephemeral. `upsertTxAtom`'s OCC guard relies on
    // bumped `updatedSeq`, which we did above.
    store.set(upsertTxAtom, liveRecord as TxRecord)
  }
}
