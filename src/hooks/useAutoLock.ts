// ABOUTME: Auto-lock enforcement — arms a single timer whose duration is preferencesAtom.autoLockMinutes; user activity resets it.
// ABOUTME: Pauses when wallet isn't unlocked, when a non-terminal tx is in flight (don't lock mid-flow), or when unmounted.

import { useEffect, useRef } from 'react'
import { getDefaultStore, useAtomValue } from 'jotai'
import { useShieldedWallet } from './useShieldedWallet'
import { preferencesAtom } from '@/state/preferences'
import { pendingTxsAtom } from '@/state/tx'
import { autoLockDeadlineAtom } from '@/state/wallet'

/** Activity events we treat as a sign of user presence. Passive listeners — no preventDefault. */
const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'pointermove',
]

/** How long to debounce activity resets — caps the cost of mousemove-style storms. */
const RESET_THROTTLE_MS = 1000

/**
 * Mount once at the App root. Listens for user activity and locks the shielded wallet after the
 * configured idle period. When a non-terminal tx is in flight, locking is deferred to a minute later
 * so we don't yank the user out of a flow at the worst possible moment.
 */
export function useAutoLock() {
  const prefs = useAtomValue(preferencesAtom)
  const pending = useAtomValue(pendingTxsAtom)
  const { state, lock } = useShieldedWallet()

  const isUnlocked = state?.status === 'unlocked'
  const timeoutMs = prefs.autoLockMinutes * 60_000

  // Refs for values that should be read at fire time without re-arming the effect on every change.
  const hasInflightRef = useRef(pending.length > 0)
  hasInflightRef.current = pending.length > 0
  const lockRef = useRef(lock)
  lockRef.current = lock

  useEffect(() => {
    const store = getDefaultStore()
    if (!isUnlocked) {
      store.set(autoLockDeadlineAtom, null)
      return
    }

    let lastReset = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    function fire() {
      if (hasInflightRef.current) {
        // Defer for a minute and re-check; locking mid-flow is worse than waiting a bit.
        const next = Date.now() + 60_000
        store.set(autoLockDeadlineAtom, next)
        timer = setTimeout(fire, 60_000)
        return
      }
      lockRef.current()
    }

    function reset() {
      const now = Date.now()
      if (now - lastReset < RESET_THROTTLE_MS) return
      lastReset = now
      if (timer) clearTimeout(timer)
      store.set(autoLockDeadlineAtom, now + timeoutMs)
      timer = setTimeout(fire, timeoutMs)
    }

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))
    // Arm the initial timer.
    store.set(autoLockDeadlineAtom, Date.now() + timeoutMs)
    timer = setTimeout(fire, timeoutMs)

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, reset))
      if (timer) clearTimeout(timer)
      store.set(autoLockDeadlineAtom, null)
    }
  }, [isUnlocked, timeoutMs])
}
