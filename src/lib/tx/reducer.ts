// ABOUTME: Pure state transitions for TxRecord — advance(), markFailed(), markExpired(). No React, no IO.
// ABOUTME: Hooks call these and write the result back to the txListAtom + IDB.

import { lifecycleFor } from './lifecycles'
import type { ArtifactsFor, StageFor, TxKind, TxRecord } from './types'

/** Advance a record to the next stage. Idempotent: returns the same record if already at terminal success. */
export function advance<K extends TxKind>(
  record: TxRecord<K>,
  toStage: StageFor<K>,
  artifactPatch: Partial<ArtifactsFor<K>> = {},
): TxRecord<K> {
  const lifecycle = lifecycleFor(record.kind)
  const stages = lifecycle.stages
  const toIndex = stages.indexOf(toStage)
  if (toIndex === -1) {
    throw new Error(`reducer.advance: stage "${toStage}" is not part of lifecycle "${record.kind}"`)
  }

  const newCompleted = [...new Set([...record.stagesCompleted, ...stages.slice(0, toIndex)])] as StageFor<K>[]
  const isTerminal = toStage === lifecycle.terminalSuccess

  return {
    ...record,
    stage: toStage,
    stagesCompleted: newCompleted,
    status: isTerminal ? 'confirmed' : 'submitted',
    updatedAt: Date.now(),
    artifacts: { ...record.artifacts, ...artifactPatch },
  }
}

export function markFailed<K extends TxKind>(record: TxRecord<K>, error: string): TxRecord<K> {
  return {
    ...record,
    status: 'failed',
    updatedAt: Date.now(),
    artifacts: { ...record.artifacts, error } as Partial<ArtifactsFor<K>>,
  }
}

export function markExpired<K extends TxKind>(record: TxRecord<K>): TxRecord<K> {
  return {
    ...record,
    status: 'expired',
    updatedAt: Date.now(),
  }
}

/** Is this stage one the user can retry from (vs starting over)? */
export function isRetryable<K extends TxKind>(record: TxRecord<K>): boolean {
  const lifecycle = lifecycleFor(record.kind)
  return (lifecycle.retryableStages as readonly string[]).includes(record.stage)
}

/** Should this record be polled on app resume? Plan §7: pending < 30 min → resume; older → mark expired. */
const RESUME_WINDOW_MS = 30 * 60_000
export function shouldResume<K extends TxKind>(record: TxRecord<K>): boolean {
  if (record.status === 'confirmed' || record.status === 'failed' || record.status === 'expired') return false
  return Date.now() - record.updatedAt < RESUME_WINDOW_MS
}
