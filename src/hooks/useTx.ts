// ABOUTME: Per-tx hook — submit a transaction, track its lifecycle, retry on failure. Multi-instance safe.
// ABOUTME: Each call generates a ulid; multiple calls = multiple concurrent tx records. Engine integration lands in Bundle 3 (executor).

import { useCallback, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ulid } from 'ulid'
import type { MetaFor, StageFor, TxKind, TxRecord, TxWalletContext } from '@/lib/tx/types'
import { lifecycleFor } from '@/lib/tx/lifecycles'
import { putTxIfFresh } from '@/lib/tx/storage'
import { txByIdAtom, upsertTxAtom } from '@/state/tx'
import { evmAddressAtom, shieldedWalletAtom } from '@/state/wallet'
import { getNetworkConfig } from '@/config/network'
import { track, trackError } from '@/lib/telemetry'

export interface UseTxOptions<K extends TxKind> {
  kind: K
}

export interface UseTxResult<K extends TxKind> {
  record: TxRecord<K> | undefined
  /** Submit a new tx. Generates the id, persists the initial record, dispatches to the executor (Bundle 3). */
  submit: (meta: MetaFor<K>) => Promise<string>
  /** Retry from a retryable stage. Dispatches the executor again with the existing record id. */
  retry: () => Promise<void>
  /** Cancel polling for this record. Does not roll back on-chain state. */
  cancel: () => void
}

export function useTx<K extends TxKind>(opts: UseTxOptions<K>): UseTxResult<K> {
  const [id, setId] = useState<string | null>(null)
  const upsert = useSetAtom(upsertTxAtom)
  const evmAddress = useAtomValue(evmAddressAtom)
  const shieldedWallet = useAtomValue(shieldedWalletAtom)
  const record = useAtomValue(useMemo(() => txByIdAtom(id ?? ''), [id])) as TxRecord<K> | undefined

  const submit = useCallback(async (meta: MetaFor<K>) => {
    const lifecycle = lifecycleFor(opts.kind)
    const initialStage = lifecycle.stages[0] as StageFor<K>
    const newId = ulid()
    const now = Date.now()

    const walletContext: TxWalletContext = {
      evmAddress: evmAddress ?? undefined,
      // TODO(Bundle 2): plural-wallet schema lands the real `id`; for now use the
      // 0zk address or a placeholder so the shape is enforced everywhere downstream.
      railgunWalletId: shieldedWallet.railgunAddress ?? 'pending-wallet',
      // TODO(per-kind): if the kind's meta carries a more specific source chain
      // (e.g. shield.fromChainId), feature passes should override this default.
      sourceChainId: getNetworkConfig().hub.chainId,
    }

    const initial: TxRecord<K> = {
      id: newId,
      kind: opts.kind,
      executionState: 'pending',
      stage: initialStage,
      stagesCompleted: [],
      updatedSeq: 0,
      createdAt: now,
      updatedAt: now,
      meta,
      artifacts: {},
      walletContext,
    }
    setId(newId)
    upsert(initial)
    await putTxIfFresh(initial)
    track('tx.submitted', { id: newId, kind: opts.kind })

    // TODO(Bundle 3): executeTx(newId) — dispatches into the registered stage handler.
    return newId
  }, [opts.kind, upsert, evmAddress, shieldedWallet])

  const retry = useCallback(async () => {
    if (!record) throw new Error('useTx.retry: no record')
    trackError('useTx.retry', new Error('not implemented'), { id: record.id })
    // TODO(Bundle 3): executeTx(record.id) re-enters at the current retryable stage.
  }, [record])

  const cancel = useCallback(() => {
    if (!record) return
    track('tx.cancelled', { id: record.id, kind: record.kind })
    // TODO(Bundle 3): cancelTx(record.id) aborts the in-flight handler.
  }, [record])

  return { record, submit, retry, cancel }
}
