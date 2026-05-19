// ABOUTME: Tx record persistence with optimistic concurrency — IDB writes are stale-rejected via updatedSeq.
// ABOUTME: Stores ALL records (pending + terminal) so the History page can render them.

import { cacheAll, cacheDelete, cacheGet, cachePut } from '../cache'
import { trackError } from '../telemetry'
import type { TxRecord } from './types'

const STORE = 'txHistory' as const

/**
 * Upsert a tx record with optimistic concurrency:
 *  - If no existing record, write the incoming.
 *  - If existing.updatedSeq < incoming.updatedSeq, write the incoming.
 *  - Else reject (returns false, emits telemetry).
 *
 * Returns true if the write went through, false if it was a stale write.
 */
export async function putTxIfFresh(record: TxRecord): Promise<boolean> {
  try {
    const existing = await cacheGet<TxRecord>(STORE, record.id)
    if (existing && existing.updatedSeq >= record.updatedSeq) {
      trackError('tx.storage.stale-write', new Error('stale updatedSeq'), {
        scope: 'tx.storage',
        message: `stale write rejected for ${record.id}`,
      })
      return false
    }
    await cachePut(STORE, record.id, record)
    return true
  } catch (err) {
    trackError('tx.storage.putTxIfFresh', err, { scope: 'tx.storage', message: 'idb write failed' })
    throw err
  }
}

/** Unconditional write — only for hydration paths or tests. Most callers want putTxIfFresh. */
export async function putTx(record: TxRecord): Promise<void> {
  await cachePut(STORE, record.id, record)
}

export async function deleteTx(id: string): Promise<void> {
  await cacheDelete(STORE, id)
}

export async function loadAllTx(): Promise<TxRecord[]> {
  const entries = await cacheAll<TxRecord>(STORE)
  return entries
    .map(e => e.value)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
