// ABOUTME: Circuit-artifact source config — the deploy-configurable base URL + the committed integrity
// ABOUTME: manifest (shape → sha256) used to fetch and verify ZK circuits at runtime. See issue #6.

import manifest from './circuits.manifest.json'

export interface CircuitHashes {
  zkey: string
  wasm: string
  vkey: string
}

interface CircuitsManifest {
  release: string
  shapes: Record<string, CircuitHashes>
}

const MANIFEST = manifest as CircuitsManifest

/** The three files served per shape (padded `NNxMM/` directory). */
export type CircuitFile = 'zkey' | 'circuit.wasm' | 'vkey.json'

/**
 * Base directory that holds the per-shape artifact folders. Deploy-config via `VITE_ARTIFACTS_BASE_URL`:
 * the host (Cloudflare R2 / relayer VPS / same-origin) serves `<base>/<NNxMM>/{zkey,circuit.wasm,vkey.json}`.
 * The release is baked into the base path by whoever deploys (e.g. `https://…/circuits/v0.1.0-dev`); the
 * committed manifest carries the release only as the integrity provenance. Defaults to same-origin
 * `/artifacts` for local dev.
 */
export function artifactBaseUrl(): string {
  const configured = import.meta.env.VITE_ARTIFACTS_BASE_URL as string | undefined
  const base = configured && configured.length > 0 ? configured : '/artifacts'
  return base.replace(/\/$/, '')
}

export function artifactUrl(paddedShape: string, file: CircuitFile): string {
  return `${artifactBaseUrl()}/${paddedShape}/${file}`
}

/**
 * Expected sha256 hashes for a shape, or undefined when the shape isn't in the pinned manifest. A miss
 * means non-deterministic local dev circuits (built by the Anvil setup, not a release) — callers skip
 * integrity verification there, since there's no canonical hash to check against.
 */
export function circuitHashes(paddedShape: string): CircuitHashes | undefined {
  return MANIFEST.shapes[paddedShape]
}

/** The circuits release the committed manifest was generated from. */
export function circuitsRelease(): string {
  return MANIFEST.release
}

/**
 * The supported circuit shapes in the `@armada/sdk` shape-key format (`<nullifiers>x<commitments>`,
 * UNPADDED — e.g. `"5x2"`), derived from the committed manifest. Fed to the SDK's `pool.supportedShapes`
 * so the planner works only in registered shapes: a fragmented transfer is split across supported-shape
 * groups, while an unsplittable spend (or one too fragmented for one batch) fails fast up front with
 * `UnsupportedCircuitShapeError` / `TooFragmentedError` — instead of failing late at artifact fetch (a
 * 404) or on-chain. The manifest keys are PADDED (`NNxMM`)
 * but the SDK's `shapeKey` is unpadded, so we strip the padding here — a padded key would never match
 * and the guard would silently never fire.
 */
export function supportedCircuitShapeKeys(): string[] {
  return Object.keys(MANIFEST.shapes).map((padded) => {
    const [n = '', m = ''] = padded.split('x')
    return `${parseInt(n, 10)}x${parseInt(m, 10)}`
  })
}
