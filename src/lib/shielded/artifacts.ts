// ABOUTME: Warms ZK circuit shapes into the in-memory registry so a proof doesn't wait on a fetch: the two common ones after
// ABOUTME: sign-in, and each spend's own planned shapes as soon as review plans it. Anything else lazy-loads on demand.

import { armadaVariantKey } from './artifactGetter'
import { ensureCircuitLoaded } from './circuitFetch'

// The shapes a typical spend uses: 1 or 2 inputs, with change and the relayer-fee output (every spend is relayed), so
// M=3 — a send, withdraw or vault deposit. The x2 shapes (a whole-balance send with no change, a merge) and the heavy /
// rare ones (e.g. 08x04, ~43 MB) are NOT preloaded: the spend's own plan warms them (`warmPlannedCircuits`), else they
// lazy-load at proof time (circuitFetch). Most common first: they download one at a time.
const PRELOAD_VARIANTS = [
  { nullifiers: 1, commitments: 3 },
  { nullifiers: 2, commitments: 3 },
] as const

/**
 * Warm the common circuit shapes into the in-memory registry from the configured artifact host, integrity-verified (see
 * circuitFetch.ts), one at a time so the first is ready sooner than if they shared a slow connection (~33 MB together).
 * Fire-and-forget once the wallet is signed in (`hooks/usePreloadCircuits`) — no proof can run before that, and signing
 * in has already loaded the SDK, so this never competes with it. A per-shape warm-up miss (host down / partial deploy) is
 * swallowed; the shape lazy-loads on first proof and surfaces a real error then if it's genuinely unavailable. The SDK
 * ArtifactSource (sdk-prover.ts) resolves circuits from this registry.
 */
export async function preloadArtifactsFromOrigin(): Promise<void> {
  for (const v of PRELOAD_VARIANTS) {
    await ensureCircuitLoaded(armadaVariantKey(v.nullifiers, v.commitments)).catch(() => {
      // One shape failing must not stop the next or crash the app. No console in lib/shielded.
    })
  }
}

/**
 * Start loading the circuits a planned spend will prove, as soon as the plan is known (the amount / review
 * steps plan every spend), so the download runs while the user reviews rather than after Confirm. Covers
 * whatever the planner picked — a fragmented wallet's swept 4x3, a fold-in's 5x2 / 6x2, a split's groups —
 * without guessing ahead of time. Fire-and-forget: already-loaded shapes return at once and concurrent
 * requests share one download (circuitFetch); a failure is swallowed here and surfaces at proof time.
 */
export async function warmPlannedCircuits(
  plans: readonly { readonly shape: { readonly nullifiers: number; readonly commitments: number } }[],
): Promise<void> {
  try {
    const keys = new Set(plans.map((p) => armadaVariantKey(p.shape.nullifiers, p.shape.commitments)))
    await Promise.allSettled([...keys].map((key) => ensureCircuitLoaded(key)))
  } catch {
    // A warm-up miss must never break planning (callers don't await it); the proof's own load reports it.
  }
}
