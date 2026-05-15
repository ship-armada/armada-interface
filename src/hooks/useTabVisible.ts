// ABOUTME: Single visibilitychange listener that publishes to tabVisibleAtom. Mount once at app root.
// ABOUTME: Pollers read tabVisibleAtom; this hook is the only place document.visibilityState is touched.

import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { tabVisibleAtom } from '@/state/visibility'

export function useTabVisible(): void {
  const setVisible = useSetAtom(tabVisibleAtom)
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [setVisible])
}
