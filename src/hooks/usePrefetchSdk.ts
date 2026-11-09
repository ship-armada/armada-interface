// ABOUTME: usePrefetchSdk — once the app shell is up (`ready`), loads @armada/sdk in the background (on idle), so its chunk is
// ABOUTME: usually ready by the time the user signs in, without competing with the first screen. Mount once at App root.

import { useEffect } from 'react'
import { prefetchSdk } from '@/lib/shielded/sdk-loader'

/** Where the browser has no idle callback (Safari), prefetch after this long instead. */
export const PREFETCH_FALLBACK_MS = 1500

/** How long an idle callback may wait before running anyway. */
const IDLE_TIMEOUT_MS = 3000

/**
 * `ready`: the first screen has rendered. Before that, the browser goes idle between startup steps (the schema migration,
 * IndexedDB reads), and an idle callback there would start the SDK download alongside the first screen.
 */
export function usePrefetchSdk(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => prefetchSdk(), { timeout: IDLE_TIMEOUT_MS })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(prefetchSdk, PREFETCH_FALLBACK_MS)
    return () => window.clearTimeout(id)
  }, [ready])
}
