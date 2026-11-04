// ABOUTME: useTxInView — registers a tx record as on screen (txInViewIdsAtom) while `inView`, so its changes raise no
// ABOUTME: toast / header notice. Used by useTx (a flow modal showing its tx) and the Dashboard's Activity receipt.

import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { txInViewIdsAtom } from '@/state/txNotices'

export function useTxInView(id: string | null, inView: boolean): void {
  const setInView = useSetAtom(txInViewIdsAtom)

  useEffect(() => {
    if (!id || !inView) return
    setInView((ids) => new Set(ids).add(id))
    return () =>
      setInView((ids) => {
        const next = new Set(ids)
        next.delete(id)
        return next
      })
  }, [id, inView, setInView])
}
