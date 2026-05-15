// ABOUTME: Hydrates txListAtom from IDB on mount and exposes filtered views for the History page.
// ABOUTME: Single source for "all tx records ever created on this device".

import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { txListAtom } from '@/state/tx'
import { loadAllTx } from '@/lib/tx/storage'
import { track, trackError } from '@/lib/telemetry'

export function useTxHistory() {
  const list = useAtomValue(txListAtom)
  const setList = useSetAtom(txListAtom)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const records = await loadAllTx()
        if (!cancelled) {
          setList(records)
          track('tx.history.hydrated', { count: records.length })
        }
      } catch (err) {
        trackError('useTxHistory.hydrate', err)
      }
    })()
    return () => { cancelled = true }
  }, [setList])

  return { list }
}
