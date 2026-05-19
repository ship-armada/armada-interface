// ABOUTME: Hydrates txListAtom from IDB on mount and exposes filtered views for the History page.
// ABOUTME: Single source for "all tx records ever created on this device".

import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { txListAtom, upsertTxAtom } from '@/state/tx'
import { loadAllTx } from '@/lib/tx/storage'
import { track, trackError } from '@/lib/telemetry'

export function useTxHistory() {
  const list = useAtomValue(txListAtom)
  const upsert = useSetAtom(upsertTxAtom)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const records = await loadAllTx()
        if (cancelled) return
        // Merge into the atom rather than overwriting. If `useTx().submit()` (or
        // the executor's resume path) wrote a record while we were awaiting the
        // IDB read, a wholesale replace would drop it. `upsertTxAtom` enforces
        // OCC via `updatedSeq`, so seeding older IDB records can't regress
        // anything newer that already lives in memory.
        for (const r of records) upsert(r)
        track('tx.history.hydrated', { count: records.length })
      } catch (err) {
        trackError('useTxHistory.hydrate', err)
      }
    })()
    return () => { cancelled = true }
  }, [upsert])

  return { list }
}
