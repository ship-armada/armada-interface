// ABOUTME: Jotai atoms for the tx list + derived selectors. The list is the source of truth; UI reads only derived atoms.
// ABOUTME: Hydration from IDB happens in a top-level effect (see hooks/useTxHistory). Writes go through upsertTxAtom which enforces OCC via updatedSeq.

import { atom } from 'jotai'
import type { TxExecutionState, TxKind, TxRecord } from '@/lib/tx/types'
import { NON_TERMINAL_STATES } from '@/lib/tx/types'

/** All tx records — pending and terminal. Most-recently-updated first. */
export const txListAtom = atom<TxRecord[]>([])

/** In-flight txs — surface as a badge on AppHeader, drive pollers/executor resume. */
export const pendingTxsAtom = atom((get) => {
  const states = new Set<TxExecutionState>(NON_TERMINAL_STATES)
  return get(txListAtom).filter(t => states.has(t.executionState))
})

/** Look up a single record by id. */
export const txByIdAtom = (id: string) => atom((get) => {
  return get(txListAtom).find(t => t.id === id)
})

/** Filter list by kind. */
export const txsForKindAtom = <K extends TxKind>(kind: K) => atom((get) => {
  return get(txListAtom).filter(t => t.kind === kind) as TxRecord<K>[]
})

/** Filter by execution state. Useful for History page tabs (All / In progress / Failed). */
export const txsForStateAtom = (state: TxExecutionState) => atom((get) => {
  return get(txListAtom).filter(t => t.executionState === state)
})

/**
 * Write-only helper: upsert a record by id with optimistic concurrency.
 * Rejects writes whose updatedSeq is not strictly greater than the existing record's.
 */
export const upsertTxAtom = atom(null, (get, set, record: TxRecord) => {
  const list = get(txListAtom)
  const idx = list.findIndex(t => t.id === record.id)
  if (idx === -1) {
    set(txListAtom, [record, ...list])
    return
  }
  const existing = list[idx]
  if (existing && existing.updatedSeq >= record.updatedSeq) {
    // Silently drop stale writes. Telemetry is emitted at the storage layer
    // (see lib/tx/storage.ts::putTxIfFresh) so we don't double-log.
    return
  }
  const next = list.slice()
  next[idx] = record
  set(txListAtom, next)
})
