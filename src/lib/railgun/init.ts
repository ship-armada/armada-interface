// ABOUTME: Railgun engine bootstrap — startRailgunEngine + POI dummy + artifact store. Drives railgunEngineAtom through cold → warming → ready / failed.
// ABOUTME: Idempotent; safe to call multiple times. Engine loads the WASM proving stack (~1 MB) lazily, so we keep init off the critical path until the user needs it.

// The Railgun SDK + its transitive deps (circomlibjs, ethereum-cryptography) crash on
// module-load under jsdom. We `import()` at call time so test files that transitively pull
// in this module don't blow up before any user code runs. Production cost: one extra microtask
// the first time initRailgunEngine() runs.
import { getDefaultStore } from 'jotai'
import { createWebDatabase } from './database'
import { createBrowserArtifactStore } from './artifacts'
import { initializeProver } from './prover'
import { loadDeployments } from '@/config/deployments'
import { trackError } from '@/lib/telemetry'
import { syncStateAtom } from '@/state/wallet'

const ENGINE_DB_NAME = 'armada-shielded'
const ENGINE_WALLET_SOURCE = 'armadainf' // ≤16 chars, lowercase, no special chars — SDK constraint

let initialized = false
let inFlight: Promise<void> | null = null
let lastError: Error | null = null

/**
 * Engine lifecycle state — observable via `subscribeEngineState`. A bridge hook in `hooks/`
 * mirrors this into `railgunEngineAtom` so React UI can show a warming indicator. Lives in
 * lib/ (no React) so the wallet flow and other lib code can read engine state without going
 * through atoms; the atom is purely the UI projection.
 */
export type EngineState = 'cold' | 'warming' | 'ready' | 'failed'

interface EngineStateSnapshot {
  readonly state: EngineState
  /** When state === 'failed', the captured error. Otherwise null. */
  readonly error: string | null
}

let currentSnapshot: EngineStateSnapshot = { state: 'cold', error: null }
const listeners = new Set<(s: EngineStateSnapshot) => void>()

function setEngineState(state: EngineState, error: string | null = null): void {
  currentSnapshot = { state, error }
  for (const listener of listeners) {
    try {
      listener(currentSnapshot)
    } catch {
      /* swallow — one bad listener mustn't break the others */
    }
  }
}

export function getEngineState(): EngineStateSnapshot {
  return currentSnapshot
}

/** Subscribe to lifecycle transitions. Returns an unsubscribe function. */
export function subscribeEngineState(listener: (s: EngineStateSnapshot) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Initialize the Railgun engine. Idempotent + reentrancy-safe — multiple concurrent calls share
 * the same in-flight promise. Throws (and caches the error) on first failure; subsequent calls
 * re-throw the same error until `resetInitState()` is called.
 *
 * The flow:
 *   1. Wire SDK loggers to our own structured-log surface (no console.log of secrets — see
 *      lib/railgun/CLAUDE.md secret-handling rules).
 *   2. Create the level-js DB (IndexedDB-backed) + the artifact store (IndexedDB-backed).
 *   3. Call startRailgunEngine with our walletSource + the stores. This loads the WASM proving
 *      stack and initializes the merkle scanner.
 *   4. Install a dummy POI node interface so proof generation doesn't crash with
 *      "Cannot read properties of undefined (reading isRequired)" on local devnet where POI
 *      isn't configured.
 *
 * Test-artifact preloading (for local Anvil POC contracts) is a separate concern handled in a
 * follow-up commit; in Sepolia mode the SDK pulls artifacts from IPFS via the artifact store.
 */
export async function initRailgunEngine(): Promise<void> {
  if (initialized) return
  if (lastError) throw lastError
  if (inFlight) return inFlight
  setEngineState('warming')
  inFlight = doInit()
  try {
    await inFlight
    initialized = true
    setEngineState('ready')
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err))
    setEngineState('failed', lastError.message)
    throw lastError
  } finally {
    inFlight = null
  }
}

async function doInit(): Promise<void> {
  const [
    { startRailgunEngine, setLoggers, setOnUTXOMerkletreeScanCallback },
    { POI },
    { MerkletreeScanStatus },
  ] = await Promise.all([
    import('@railgun-community/wallet'),
    import('@railgun-community/engine'),
    import('@railgun-community/shared-models'),
  ])

  // SDK logging — wire to console for v1, but never inside a function that handles secrets.
  // Phase 1 secret-handling rules: secrets-bearing scopes (wallet.ts, keyManager.ts) MUST NOT
  // log through console; the SDK's internal logs are about engine lifecycle, not key material.
  setLoggers(
    (msg: string) => {
      // eslint-disable-next-line no-console
      console.log('[railgun]', msg)
    },
    (err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[railgun]', err)
    },
  )

  const db = createWebDatabase(ENGINE_DB_NAME)
  const artifactStore = await createBrowserArtifactStore()

  // Patch the engine's per-chain V2 start block to our PrivacyPool deploy block. The SDK's
  // hardcoded ENGINE_V2_START_BLOCK_NUMBERS_EVM table only has entries for the legacy Railgun
  // mainnet deploys; for any new chain (e.g. Sepolia 11155111) it falls through to 0 and the
  // initial Shield/Transact/Unshield event scan walks the entire chain history (hundreds of
  // empty getLogs chunks on public RPCs → rate-limited and sync fails silently). We read the
  // deploy block from the manifest written by deploy_privacy_pool.ts (ship-armada/armada-poc#278)
  // and mutate the SDK's mutable constants object before the first scan runs.
  //
  // Non-fatal on failure: if the deep import or the manifest read goes wrong, we leave the
  // constant at 0. Sync will work — just slowly — and we'll see a telemetry error.
  await patchEngineStartBlock()

  await startRailgunEngine(
    ENGINE_WALLET_SOURCE,
    db as never, // level-js export shape isn't typed; SDK accepts the leveldown-compatible API
    true, // shouldDebug
    artifactStore,
    false, // useNativeArtifacts (false = WASM for browser)
    false, // skipMerkletreeScans (false = enable balance scanning)
    undefined, // poiNodeURLs (POI disabled; see POI.init below)
    undefined, // customPOILists
    true, // verboseScanLogging
  )

  // Wire SDK merkletree scan progress into syncStateAtom so the UI can show a banner +
  // progress bar during the initial historical scan. The SDK emits one of four statuses;
  // we map them to our SyncState shape. Progress is 0..1.
  const store = getDefaultStore()
  setOnUTXOMerkletreeScanCallback((event) => {
    const { scanStatus, progress } = event
    switch (scanStatus) {
      case MerkletreeScanStatus.Started:
        store.set(syncStateAtom, { status: 'syncing', progress: 0 })
        break
      case MerkletreeScanStatus.Updated:
        store.set(syncStateAtom, { status: 'syncing', progress: progress ?? 0 })
        break
      case MerkletreeScanStatus.Complete:
        store.set(syncStateAtom, { status: 'complete', progress: 1 })
        break
      case MerkletreeScanStatus.Incomplete:
        store.set(syncStateAtom, { status: 'failed', progress: progress ?? 0 })
        break
    }
  })

  // Wire snarkjs as the Groth16 prover implementation. Unshield / transfer proofs throw
  // "Requires groth16 full prover implementation" without this. Shield doesn't need it
  // (ECIES + Poseidon only), but we initialize unconditionally so the first unshield doesn't
  // pay the snarkjs import cost on the critical path.
  await initializeProver()

  // POI is required by the SDK for proof generation calls, but our deployment doesn't run a POI
  // node. Install a noop interface so isRequiredForChain() returns false without crashing.
  try {
    const dummyNodeInterface = {
      isActive: () => false,
      isRequired: async () => false,
      getPOIsPerList: async () => ({}),
      getPOIMerkleProofs: async () => ({}),
      validatePOIMerkleroots: async () => true,
      submitPOI: async () => {},
      submitLegacyTransactProofs: async () => {},
    }
    POI.init([], dummyNodeInterface as unknown as Parameters<typeof POI.init>[1])
  } catch {
    // Non-fatal — if POI.init fails the engine still runs for non-proof operations (balance
    // scan, address derivation). Proof-generating flows will surface the error at call time.
  }
}

export function isRailgunEngineInitialized(): boolean {
  return initialized
}

/**
 * Mutate the engine's per-chain V2 start-block constants so the initial scan starts at our
 * PrivacyPool deploy block instead of block 0. Idempotent — safe to call from doInit each time.
 *
 * Implementation note: the constant object lives at `@railgun-community/engine/dist/utils/constants`
 * and is not re-exported from the package's main entry. The deep import works under Vite + node
 * resolution today; if a future SDK version tightens its `exports` map and blocks this path, the
 * try/catch swallows the failure and sync falls back to scanning from block 0 (slower but correct).
 */
async function patchEngineStartBlock(): Promise<void> {
  try {
    const deployments = await loadDeployments()
    const chainId = deployments.hub.chainId
    const deployBlock = deployments.hub.deployBlock
    if (typeof deployBlock !== 'number' || deployBlock <= 0) {
      // Manifest didn't include a deploy block (older deploys, or local mode). Skip.
      return
    }
    // Deep import. The engine package restricts its `exports` field to the main entry, but
    // tsc + Vite resolve filesystem paths inside node_modules without enforcing that field for
    // legacy packages — so this Just Works at both compile time and runtime. The narrow cast
    // captures the shape we depend on; a future SDK rewrite could break this and the try/catch
    // around the whole function would surface a telemetry error.
    type EngineConstants = {
      ENGINE_V2_START_BLOCK_NUMBERS_EVM?: Record<number, number>
      ENGINE_V2_SHIELD_EVENT_UPDATE_03_09_23_BLOCK_NUMBERS_EVM?: Record<number, number>
    }
    // @ts-expect-error - deep import; engine package's exports field hides this path from tsc
    const constants = (await import('@railgun-community/engine/dist/utils/constants')) as EngineConstants
    if (constants.ENGINE_V2_START_BLOCK_NUMBERS_EVM) {
      constants.ENGINE_V2_START_BLOCK_NUMBERS_EVM[chainId] = deployBlock
    }
    if (constants.ENGINE_V2_SHIELD_EVENT_UPDATE_03_09_23_BLOCK_NUMBERS_EVM) {
      // Our shield event uses the post-Mar-23 format (no legacy variant). Setting this to the
      // same deploy block ensures the scanner never wastes time looking for legacy shield events.
      constants.ENGINE_V2_SHIELD_EVENT_UPDATE_03_09_23_BLOCK_NUMBERS_EVM[chainId] = deployBlock
    }
  } catch (err) {
    trackError('railgun.init.patchEngineStartBlock', err, {
      scope: 'engine.init',
      message: 'failed to patch engine V2 start block — sync will scan from block 0',
    })
  }
}

export function getRailgunInitError(): Error | null {
  return lastError
}

/** Reset module-scope init state — for hot-reload / test scenarios. */
export function resetInitState(): void {
  initialized = false
  inFlight = null
  lastError = null
  setEngineState('cold')
}
