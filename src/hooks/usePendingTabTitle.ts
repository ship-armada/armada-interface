// ABOUTME: usePendingTabTitle — prefixes the browser tab title with the number of in-flight txs ("(1) Armada App — …"),
// ABOUTME: so a backgrounded tab shows work is still going. Mount once at App root.

import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { pendingTxsAtom } from '@/state/tx'

export function usePendingTabTitle(): void {
  const pendingCount = useAtomValue(pendingTxsAtom).length
  // The page's own title (index.html), captured once so the prefix never stacks.
  const baseTitleRef = useRef<string | null>(null)
  if (baseTitleRef.current === null) baseTitleRef.current = document.title

  useEffect(() => {
    const base = baseTitleRef.current ?? document.title
    document.title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base
  }, [pendingCount])

  useEffect(
    () => () => {
      if (baseTitleRef.current !== null) document.title = baseTitleRef.current
    },
    [],
  )
}
