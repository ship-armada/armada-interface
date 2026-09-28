// ABOUTME: Warms ZK circuit shapes into the in-memory registry so a proof doesn't wait on a fetch: the common ones on
// ABOUTME: app mount, and each spend's own planned shapes as soon as review plans it. Anything else lazy-loads on demand.

import { armadaVariantKey } from './artifactGetter'
import { ensureCircuitLoaded } from './circuitFetch'

// The shapes the common flows hit first: 1–2 input spends, with or without the broadcaster-fee output
// (the extra output makes M=3). Heavy/rare shapes (e.g. 08x04, ~43 MB) are intentionally NOT warmed —
// they lazy-load from the artifact host on first use (circuitFetch), keeping mount cheap.
const PRELOAD_VARIANTS = [
  { nullifiers: 1, commitments: 2 },
  { nullifiers: 1, commitments: 3 },
  { nullifiers: 2, commitments: 2 },
  { nullifiers: 2, commitments: 3 },
] as const

/**
 * Warm the common circuit shapes into the in-memory registry from the configured artifact host,
 * integrity-verified (see circuitFetch.ts). Fire-and-forget on app mount, off the critical path — a
 * per-shape warm-up miss (host down / partial deploy) is swallowed; the shape will lazy-load on first
 * proof and surface a real error then if it's genuinely unavailable. The SDK ArtifactSource
 * (sdk-prover.ts) resolves circuits from this registry.
 */
export async function preloadArtifactsFromOrigin(): Promise<void> {
  await Promise.all(
    PRELOAD_VARIANTS.map((v) =>
      ensureCircuitLoaded(armadaVariantKey(v.nullifiers, v.commitments)).catch(() => {
        // One shape failing must not abort the others or crash the app. No console in lib/shielded.
      }),
    ),
  )
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
