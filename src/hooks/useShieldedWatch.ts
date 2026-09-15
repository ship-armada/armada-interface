// ABOUTME: Liveness-floor auto-sync via the @armada/sdk wallet.watch() loop (armada-sdk #59) — a
// ABOUTME: low-frequency, error-backoff-resilient sync running under the adaptive useShieldedSyncPoll cadence.

import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { activeShieldedWalletAtom } from '@/state/wallet'
import { tabVisibleAtom } from '@/state/visibility'
import { getSdkWallet } from '@/lib/shielded/sdk-read'
import { trackError } from '@/lib/telemetry'

// Floor cadence for the SDK's auto-sync loop. Deliberately SLOWER than useShieldedSyncPoll's 15s
// steady state: watch() is a resilience floor (SDK-native immediate-run + exponential error backoff),
// not the primary driver. Its sync() coalesces with the poll's, so overlapping ticks do no double work.
const WATCH_FLOOR_INTERVAL_MS = 30_000

/**
 * Run `wallet.watch()` (armada-sdk #59) while the wallet is unlocked and the tab is visible — an
 * SDK-native auto-sync loop with immediate-run + exponential error backoff. It sits UNDER the adaptive
 * `useShieldedSyncPoll` (5s in-flight / 3s catch-up / 15s steady): that poll stays the primary driver
 * because `watch()`'s fixed interval can't reproduce the tx-responsive tightening. `watch()` adds a
 * low-frequency liveness floor whose error-backoff keeps sync alive even if a poll fetch stalls, and
 * coalesces with the poll's `sync()` so the two never double-scan.
 *
 * Visibility-gated to honour the app-wide "hidden tabs don't burn quota" convention — the SDK loop
 * would otherwise keep syncing in a backgrounded tab. `immediate: false` because the poll already
 * syncs on mount. Mount once at App root.
 */
export function useShieldedWatch(): void {
  const active = useAtomValue(activeShieldedWalletAtom)
  const tabVisible = useAtomValue(tabVisibleAtom)
  const enabled = active?.status === 'unlocked' && tabVisible

  useEffect(() => {
    if (!enabled) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    void getSdkWallet()
      .then((wallet) => {
        // Torn down (lock / hidden / wallet switch) before the instance resolved — don't start a loop
        // that the cleanup below already ran past.
        if (cancelled) return
        try {
          unsubscribe = wallet.watch({
            intervalMs: WATCH_FLOOR_INTERVAL_MS,
            immediate: false,
            onError: (err) => trackError('shielded.watch', err),
          })
        } catch (err) {
          // watch() throws if already watching — benign under StrictMode double-invoke; log and move on.
          trackError('shielded.watch.start', err)
        }
      })
      .catch((err) => trackError('shielded.watch.ensure', err))
    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [enabled, active?.id])
}
