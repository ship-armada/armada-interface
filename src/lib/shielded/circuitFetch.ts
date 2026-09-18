// ABOUTME: Fetches a circuit shape's {zkey, wasm, vkey} from the configured artifact host and verifies
// ABOUTME: each file's sha256 against the committed manifest before use. Populates the in-memory registry.

import { artifactUrl, circuitHashes } from '@/config/circuits'
import { getArmadaArtifact, setArmadaArtifact } from './artifactGetter'

export interface FetchedCircuit {
  zkey: Uint8Array
  wasm: Uint8Array
  vkey: object
}

// De-dupes concurrent fetches of the SAME shape (two spends needing 08x04 at once share one download).
// Holds only pending promises — cleared on settle; the artifact registry is the durable cache.
const inFlight = new Map<string, Promise<FetchedCircuit>>()

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`circuit fetch ${url} → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Verify a fetched artifact against its pinned hash. `expected` is undefined for shapes absent from the
 * manifest (local non-deterministic dev circuits) — verification is skipped there. On a mismatch we
 * throw loudly rather than hand a tampered/corrupt artifact to the prover.
 */
async function verify(url: string, bytes: Uint8Array, expected: string | undefined): Promise<void> {
  if (!expected) return
  const actual = await sha256Hex(bytes)
  if (actual !== expected) {
    throw new Error(`circuit integrity check failed for ${url}: expected ${expected}, got ${actual}`)
  }
}

async function fetchAndVerify(paddedShape: string): Promise<FetchedCircuit> {
  const hashes = circuitHashes(paddedShape)
  const [zkey, wasm, vkeyBytes] = await Promise.all([
    fetchBytes(artifactUrl(paddedShape, 'zkey')),
    fetchBytes(artifactUrl(paddedShape, 'circuit.wasm')),
    fetchBytes(artifactUrl(paddedShape, 'vkey.json')),
  ])
  await Promise.all([
    verify(artifactUrl(paddedShape, 'zkey'), zkey, hashes?.zkey),
    verify(artifactUrl(paddedShape, 'circuit.wasm'), wasm, hashes?.wasm),
    verify(artifactUrl(paddedShape, 'vkey.json'), vkeyBytes, hashes?.vkey),
  ])
  // vkey is verified as raw bytes (byte-identical to the release file), then parsed for the prover.
  const vkey = JSON.parse(new TextDecoder().decode(vkeyBytes)) as object
  return { zkey, wasm, vkey }
}

/** Fetch + integrity-verify a shape's artifacts, de-duping concurrent requests for the same shape. */
export function fetchCircuitShape(paddedShape: string): Promise<FetchedCircuit> {
  const existing = inFlight.get(paddedShape)
  if (existing) return existing
  const p = fetchAndVerify(paddedShape)
  inFlight.set(paddedShape, p)
  // Clear on settle (success OR failure) — the registry caches successes; a failure should be retryable.
  void p.finally(() => inFlight.delete(paddedShape))
  return p
}

/**
 * Ensure a shape is present in the in-memory artifact registry: no-op if already loaded, else
 * fetch + verify + store. Shared by the mount preload (common shapes) and the ArtifactSource's
 * lazy resolve (any shape on first proof).
 */
export async function ensureCircuitLoaded(paddedShape: string): Promise<void> {
  const cached = getArmadaArtifact(paddedShape)
  if (cached && cached.wasm !== undefined && cached.zkey !== undefined && cached.vkey !== undefined) return
  const { zkey, wasm, vkey } = await fetchCircuitShape(paddedShape)
  setArmadaArtifact(paddedShape, { zkey, wasm, vkey })
}
