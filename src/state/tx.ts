// ABOUTME: Jotai atoms for the tx list + derived selectors. The list is the source of truth; UI reads only derived atoms.
// ABOUTME: Hydration from IDB happens in a top-level effect (see hooks/useTxHistory).

import { atom } from 'jotai'
import type { TxKind, TxRecord, TxStatus } from '@/lib/tx/types'

/** All tx records — pending and terminal. Most-recently-updated first. */
export const txListAtom = atom<TxRecord[]>([])

/** Just the in-flight ones — surface as a badge on AppHeader, drives pollers. */
export const pendingTxsAtom = atom((get) => {
  return get(txListAtom).filter(t => t.status === 'building' || t.status === 'submitted')
})

/** Look up a single record by id. Returns undefined if not found. */
export const txByIdAtom = (id: string) => atom((get) => {
  return get(txListAtom).find(t => t.id === id)
})

/** Filter list by kind — e.g. just yield deposits/withdraws for the yield page. */
export const txsForKindAtom = <K extends TxKind>(kind: K) => atom((get) => {
  return get(txListAtom).filter(t => t.kind === kind) as TxRecord<K>[]
})

/** Filter list by status. Useful for History page tabs (All / Pending / Failed). */
export const txsForStatusAtom = (status: TxStatus) => atom((get) => {
  return get(txListAtom).filter(t => t.status === status)
})

/** Write-only helper: upsert a record by id (insert if new, replace if existing). */
export const upsertTxAtom = atom(null, (get, set, record: TxRecord) => {
  const list = get(txListAtom)
  const idx = list.findIndex(t => t.id === record.id)
  if (idx === -1) set(txListAtom, [record, ...list])
  else {
    const next = list.slice()
    next[idx] = record
    set(txListAtom, next)
  }
})
