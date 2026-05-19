// ABOUTME: Bridges lib/railgun/init's lifecycle pub/sub into railgunEngineAtom so React UI can render warmup state.
// ABOUTME: Mount once at App root (alongside useTabVisible, useAutoLock, etc.). Pure side-effect hook; no return value.

import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { railgunEngineAtom } from '@/state/wallet'
import { getEngineState, subscribeEngineState } from '@/lib/railgun/init'

/**
 * Subscribe to lib/railgun/init's engine state and mirror it into the Jotai atom on every
 * transition. The first listener call happens during the subscription itself (we seed with
 * the current snapshot) so the atom is correct even if the engine warmed up before this
 * component mounted (HMR / StrictMode double-mount).
 */
export function useRailgunEngineSync(): void {
  const setEngine = useSetAtom(railgunEngineAtom)

  useEffect(() => {
    // Seed with current state — covers HMR re-mount where init already finished.
    const initial = getEngineState()
    setEngine(initial.error ? { state: initial.state, error: initial.error } : { state: initial.state })

    const unsubscribe = subscribeEngineState((next) => {
      setEngine(next.error ? { state: next.state, error: next.error } : { state: next.state })
    })
    return unsubscribe
  }, [setEngine])
}
