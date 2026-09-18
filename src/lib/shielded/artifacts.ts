// ABOUTME: Warms the common ZK circuit shapes into the in-memory registry on app mount so the first
// ABOUTME: proof doesn't pay a fetch. Every other shape lazy-loads on demand via the SDK ArtifactSource.

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
