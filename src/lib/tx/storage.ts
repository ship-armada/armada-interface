// ABOUTME: Tx record persistence — IDB writes on every state change, hydration on app start.
// ABOUTME: Stores ALL records (pending + terminal) so History page can render them. Garbage collection is a future concern.

import { cacheAll, cacheDelete, cachePut } from '../cache'
import type { TxRecord } from './types'

const STORE = 'txHistory' as const

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
