// ABOUTME: Per-tx hook — submit a transaction, track its lifecycle, retry on failure. Multi-instance safe.
// ABOUTME: Each call generates a ulid; multiple calls = multiple concurrent tx records. Stub: typed API only.

import { useCallback, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ulid } from 'ulid'
import type { MetaFor, StageFor, TxKind, TxRecord } from '@/lib/tx/types'
import { lifecycleFor } from '@/lib/tx/lifecycles'
import { txByIdAtom, upsertTxAtom } from '@/state/tx'
import { putTx } from '@/lib/tx/storage'
import { track, trackError } from '@/lib/telemetry'

export interface UseTxOptions<K extends TxKind> {
  kind: K
}

export interface UseTxResult<K extends TxKind> {
  record: TxRecord<K> | undefined
  /** Submit a new tx. Generates the id, persists initial record, kicks off (eventually) the stage pipeline. */
  submit: (meta: MetaFor<K>) => Promise<string>
  /** Retry from a retryable stage. Throws if record isn't in a retryable state. */
  retry: () => Promise<void>
  /** Cancel polling for this record. Does not roll back on-chain state. */
  cancel: () => void
}

export function useTx<K extends TxKind>(opts: UseTxOptions<K>): UseTxResult<K> {
  const [id, setId] = useState<string | null>(null)
  const upsert = useSetAtom(upsertTxAtom)
  const record = useAtomValue(useMemo(() => txByIdAtom(id ?? ''), [id])) as TxRecord<K> | undefined

  const submit = useCallback(async (meta: MetaFor<K>) => {
    const lifecycle = lifecycleFor(opts.kind)
    const initialStage = lifecycle.stages[0] as StageFor<K>
    const newId = ulid()
    const now = Date.now()
    const initial: TxRecord<K> = {
      id: newId,
      kind: opts.kind,
      status: 'building',
      stage: initialStage,
      stagesCompleted: [],
      createdAt: now,
      updatedAt: now,
      meta,
      artifacts: {},
    }
    setId(newId)
    upsert(initial)
    await putTx(initial)
    track('tx.submitted', { id: newId, kind: opts.kind })

    // TODO: kick off the stage pipeline (build proof → relay → confirm). For now we leave the record
    // in `building` so the UI can render the initial stage.
    return newId
  }, [opts.kind, upsert])

  const retry = useCallback(async () => {
    if (!record) throw new Error('useTx.retry: no record')
    trackError('useTx.retry', new Error('not implemented'), { id: record.id })
    // TODO: re-enter the retryable stage. Implementation pairs with the stage pipeline above.
  }, [record])

  const cancel = useCallback(() => {
    if (!record) return
    track('tx.canceled', { id: record.id })
    // TODO: abort any in-flight pollers tied to this id.
  }, [record])

  return { record, submit, retry, cancel }
}
