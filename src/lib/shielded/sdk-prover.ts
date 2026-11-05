// ABOUTME: Write-capable @armada/sdk wiring — a Web Worker snarkjs ProverAdapter + an ArtifactSource that resolves circuits
// ABOUTME: from the interface's in-memory artifact registry (artifactGetter). Both report their timings (sdk.proof / sdk.artifact.resolve).

import {
  createWorkerProver,
  webWorkerChannel,
  type ArtifactSet,
  type ArtifactSource,
  type BrowserWorkerLike,
  type CircuitShape,
  type ProverAdapter,
  type WorkerChannel,
} from '@armada/sdk'
import { armadaVariantKey, getArmadaArtifact } from './artifactGetter'
import { ensureCircuitLoaded } from './circuitFetch'
import { track } from '@/lib/telemetry'

/** Whether this page has finished a proof yet — the first also pays the worker's start-up. */
let provedThisSession = false

/** Test hook: start a fresh "session" so the first-proof flag can be exercised. */
export function __resetProofSessionForTests(): void {
  provedThisSession = false
}

/**
 * A `WorkerChannel` over a browser Web Worker running the SDK's prebuilt prover entry.
 *
 * `@armada/sdk/prover/worker` is the SDK-maintained, self-wiring worker module — it installs its own
 * `onmessage` handler around `createProverWorkerHandler` and imports ONLY the lean `@armada/sdk/prover`
 * subpath (snarkjs, no 13MB wasm-inlined root), so Vite bundles a small worker chunk. Pairing it with
 * `webWorkerChannel` keeps the two-phase `proof:progress` (witness → proving) flowing to the main thread.
 */
function createProverWorkerChannel(): WorkerChannel {
  const worker = new Worker(new URL('@armada/sdk/prover/worker', import.meta.url), { type: 'module' })
  // The DOM `Worker.onmessage` param is `MessageEvent` — wider than `BrowserWorkerLike`'s `{ data }`,
  // so it fails `strictFunctionTypes` assignability. `webWorkerChannel` only reads `event.data`, so the
  // shapes are runtime-compatible; narrow at the boundary rather than pull the DOM lib into the SDK.
  return webWorkerChannel(worker as unknown as BrowserWorkerLike)
}

/**
 * Off-main-thread Groth16 prover — snarkjs runs in a Web Worker so proving never blocks the UI
 * (replaces the engine's `yieldToPaint` main-thread block). The SDK starts the worker LAZILY on the
 * first request, so read-only sessions (which never prove) don't spawn one; it starts a fresh worker
 * after a crash or a cancelled proof, and `close()` terminates it.
 */
export function createInterfaceProver(): ProverAdapter {
  const prover = createWorkerProver(createProverWorkerChannel)
  return {
    // Timed per proof (package 7): how long proving takes, and whether the first proof pays a start-up penalty.
    async prove(formattedInputs, artifacts, options) {
      const startedAt = performance.now()
      const proof = await prover.prove(formattedInputs, artifacts, options)
      track('sdk.proof', { durationMs: Math.round(performance.now() - startedAt), firstOfSession: !provedThisSession })
      provedThisSession = true
      return proof
    },
    verify: (proof, publicSignals, vkey) => prover.verify(proof, publicSignals, vkey),
    close: () => prover.close(),
  }
}

/**
 * `ArtifactSource` bridging the SDK to the interface's in-memory circuit registry. On a registry miss
 * it lazy-fetches the shape from the configured artifact host (`VITE_ARTIFACTS_BASE_URL`, default
 * same-origin `/artifacts`) and integrity-verifies it against the committed manifest before caching it
 * (see circuitFetch.ts) — so ANY served shape resolves on first proof, not just the preloaded common
 * ones (#6). A genuine 404 or a hash mismatch throws loudly; there is no IPFS fallback.
 */
export function createInterfaceArtifactSource(): ArtifactSource {
  return {
    async resolve(shape: CircuitShape): Promise<ArtifactSet> {
      const key = armadaVariantKey(shape.nullifiers, shape.commitments)
      const cached = getArmadaArtifact(key) !== undefined
      const startedAt = performance.now()
      await ensureCircuitLoaded(key)
      track('sdk.artifact.resolve', { shape: key, durationMs: Math.round(performance.now() - startedAt), cached })
      const artifact = getArmadaArtifact(key)
      if (!artifact || artifact.wasm === undefined || artifact.zkey === undefined || artifact.vkey === undefined) {
        // ensureCircuitLoaded resolves or throws; a populated-but-incomplete registry entry here is a bug.
        throw new Error(`sdk-prover: circuit ${key} unavailable after load`)
      }
      return {
        wasm: artifact.wasm as Uint8Array,
        zkey: artifact.zkey as Uint8Array,
        vkey: artifact.vkey as object,
      }
    },
  }
}
