// ABOUTME: usePreloadCircuits — once the wallet is signed in, download the common ZK circuits in the background so a
// ABOUTME: typical spend's proof doesn't wait on them. A visitor who never signs in downloads none (#144).

import { useEffect } from 'react'
import { preloadArtifactsFromOrigin } from '@/lib/shielded/artifacts'
import { trackError } from '@/lib/telemetry'

/** Mount once at App root with whether the wallet is unlocked. */
export function usePreloadCircuits(unlocked: boolean): void {
  useEffect(() => {
    if (!unlocked) return
    // Fire-and-forget: shapes already loaded return at once, so a lock → sign-in again costs nothing.
    void preloadArtifactsFromOrigin().catch((err) => trackError('shielded.artifacts.preload', err))
  }, [unlocked])
}
