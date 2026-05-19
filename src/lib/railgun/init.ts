// ABOUTME: Railgun engine bootstrap — startRailgunEngine + POI dummy + artifact store. Drives railgunEngineAtom through cold → warming → ready / failed.
// ABOUTME: Idempotent; safe to call multiple times. Engine loads the WASM proving stack (~1 MB) lazily, so we keep init off the critical path until the user needs it.

// The Railgun SDK + its transitive deps (circomlibjs, ethereum-cryptography) crash on
// module-load under jsdom. We `import()` at call time so test files that transitively pull
// in this module don't blow up before any user code runs. Production cost: one extra microtask
// the first time initRailgunEngine() runs.
import { createWebDatabase } from './database'
import { createBrowserArtifactStore } from './artifacts'

const ENGINE_DB_NAME = 'armada-shielded'
const ENGINE_WALLET_SOURCE = 'armadainf' // ≤16 chars, lowercase, no special chars — SDK constraint

let initialized = false
let inFlight: Promise<void> | null = null
let lastError: Error | null = null

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
  inFlight = doInit()
  try {
    await inFlight
    initialized = true
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err))
    throw lastError
  } finally {
    inFlight = null
  }
}

async function doInit(): Promise<void> {
  const [{ startRailgunEngine, setLoggers }, { POI }] = await Promise.all([
    import('@railgun-community/wallet'),
    import('@railgun-community/engine'),
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

export function getRailgunInitError(): Error | null {
  return lastError
}

/** Reset module-scope init state — for hot-reload / test scenarios. */
export function resetInitState(): void {
  initialized = false
  inFlight = null
  lastError = null
}
