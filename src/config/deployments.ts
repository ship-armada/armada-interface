// ABOUTME: Loads privacy-pool deployment manifests for hub + each client chain at app start.
// ABOUTME: Schema typed against actual manifest shapes; fetched via the serveDeployments() Vite dev plugin.

import { getNetworkConfig, type ChainIdentity } from './network'

/** Hub privacy-pool deployment shape (privacy-pool-hub*.json). */
export interface PrivacyPoolHubDeployment {
  chainId: number
  domain: number
  deployer: string
  contracts: {
    privacyPool: string
    merkleModule: string
    verifierModule: string
    shieldModule: string
    transactModule: string
    hookRouter: string
    /**
     * Phase B2 — permit-based gasless `GaslessShieldWrapper` for hub gasless shield. Optional
     * because manifests predating B2 don't carry it; B3's shield handler falls back to
     * direct-submit (the Phase A path) when this is absent.
     */
    gaslessShieldWrapper?: string
  }
  cctp: {
    tokenMessenger: string
    messageTransmitter: string
    usdc: string
  }
  /**
   * Block number the PrivacyPool router was deployed at. Used to bound the SDK's
   * initial historical scan — without it the engine starts from block 0 (Sepolia isn't in the
   * SDK's hardcoded start-block table) and burns hundreds of getLogs calls walking empty
   * pre-deploy chain history. Optional for backward compat with older manifests.
   */
  deployBlock?: number
  timestamp: string
}

/** Client privacy-pool deployment shape (privacy-pool-client*.json). */
export interface PrivacyPoolClientDeployment {
  chainId: number
  domain: number
  deployer: string
  contracts: {
    privacyPoolClient: string
    hookRouter: string
    /**
     * Phase B2 — permit-based gasless `GaslessShieldWrapperClient` for cross-chain gasless
     * shield originating on this client. Same optional-with-fallback rationale as the hub's
     * `gaslessShieldWrapper`.
     */
    gaslessShieldWrapperClient?: string
  }
  cctp: {
    tokenMessenger: string
    messageTransmitter: string
    usdc: string
  }
  hub: {
    domain: number
    privacyPool: string
  }
  /** Block the PrivacyPoolClient was deployed at. Optional; not consumed today (only the hub
   *  chain is scanned), but kept on the type for parity + future use. */
  deployBlock?: number
  timestamp: string
}

export interface ResolvedDeployments {
  hub: PrivacyPoolHubDeployment
  clients: PrivacyPoolClientDeployment[]
}

/** `-sepolia` on testnet, empty locally — matches armada-poc's manifest filename suffix. */
function modeSuffix(): string {
  return getNetworkConfig().mode === 'sepolia' ? '-sepolia' : ''
}

/**
 * Upper bound on client manifests probed at startup. Deployments write a contiguous `client1..N`
 * sequence (armada-poc `CLIENT_COUNT`), so probing stops at the first gap; this is only a safety cap
 * so a misconfigured server can't drive an unbounded probe loop.
 */
const MAX_CLIENT_MANIFESTS = 32

async function fetchManifest<T>(name: string): Promise<T> {
  const res = await fetch(`/api/deployments/${name}`)
  if (!res.ok) {
    throw new Error(
      `Deployment manifest not found: ${name}. Run \`npm run setup\` from the project root first.`,
    )
  }
  return (await res.json()) as T
}

/** Like fetchManifest but returns null on a 404 instead of throwing — used to probe for client files. */
async function tryFetchManifest<T>(name: string): Promise<T | null> {
  const res = await fetch(`/api/deployments/${name}`)
  if (!res.ok) return null
  return (await res.json()) as T
}

let cached: ResolvedDeployments | null = null
let pendingDeployments: Promise<ResolvedDeployments> | null = null

export async function loadDeployments(): Promise<ResolvedDeployments> {
  if (cached) return cached
  // Single-flight: coalesce concurrent callers onto ONE fetch so a burst (e.g. readPathConfig fired by
  // several readers on unlock) doesn't re-request the same static manifests. The in-flight ref is cleared
  // on settle, so a transient failure retries and a success falls through to `cached`.
  if (pendingDeployments) return pendingDeployments
  const p: Promise<ResolvedDeployments> = (async (): Promise<ResolvedDeployments> => {
    const cfg = getNetworkConfig()
    const suffix = modeSuffix()
    // Hub is the unique chain, so its manifest name is stable + required.
    const hub = await fetchManifest<PrivacyPoolHubDeployment>(`privacy-pool-hub${suffix}.json`)

    // Discover client manifests WITHOUT assuming which ordinal maps to which chain: probe the
    // contiguous `privacy-pool-client<i>` files and index each by its EMBEDDED `chainId` (the stable
    // identifier). A chain can be `client1` in one deployment and `client2` in another, and some
    // instances omit a chain entirely — binding by chainId is robust to both.
    const manifestByChainId = new Map<number, PrivacyPoolClientDeployment>()
    for (let i = 1; i <= MAX_CLIENT_MANIFESTS; i++) {
      const m = await tryFetchManifest<PrivacyPoolClientDeployment>(`privacy-pool-client${i}${suffix}.json`)
      if (!m) break // contiguous client1..N — the first gap marks the end of the list
      manifestByChainId.set(m.chainId, m)
    }

    // Keep the enabled clients that are actually deployed in this instance, in registry order. An
    // enabled-but-undeployed client is skipped (not a hard failure) so the app adapts to whatever the
    // target deployment ships (e.g. an instance with Base + Optimism but no Arbitrum).
    const clients: PrivacyPoolClientDeployment[] = []
    for (const client of cfg.clients) {
      const m = manifestByChainId.get(client.chainId)
      if (m) clients.push(m)
      else console.warn(
        `[deployments] enabled client ${client.name} (chainId ${client.chainId}) has no deployment manifest in this instance — skipping`,
      )
    }

    cached = { hub, clients }
    return cached
  })().finally(() => {
    if (pendingDeployments === p) pendingDeployments = null
  })
  pendingDeployments = p
  return p
}

export function getCachedDeployments(): ResolvedDeployments | null {
  return cached
}

/** Map a chain id to its deployment manifest (hub or one of the clients). */
export function findDeploymentForChain(
  deployments: ResolvedDeployments,
  chainId: number,
): PrivacyPoolHubDeployment | PrivacyPoolClientDeployment | undefined {
  if (deployments.hub.chainId === chainId) return deployments.hub
  return deployments.clients.find(c => c.chainId === chainId)
}

/** Type guard. */
export function isHubDeployment(
  d: PrivacyPoolHubDeployment | PrivacyPoolClientDeployment,
): d is PrivacyPoolHubDeployment {
  return 'privacyPool' in d.contracts
}

/** Helper: get the USDC address on a given chain. */
export function getUsdcAddress(deployments: ResolvedDeployments, chain: ChainIdentity): string | undefined {
  return findDeploymentForChain(deployments, chain.chainId)?.cctp.usdc
}

/**
 * Yield deployment manifest (`yield-hub.json` / `yield-hub-sepolia.json`). Separate from the
 * privacy-pool manifests because yield is an optional layer — not every deployment runs it.
 *
 * `armadaYieldVault` issues shielded ayUSDC shares; `armadaYieldAdapter` is the relay-adapt
 * target that `lendAndShield` / `redeemAndShield` call. Both addresses are required for the
 * yield-deposit / yield-withdraw handlers.
 */
export interface YieldDeployment {
  chainId: number
  contracts: {
    armadaYieldVault: string
    armadaYieldAdapter: string
  }
  config: {
    usdc: string
    mockAaveSpoke: string
    reserveId: number
    yieldFeeBps: number
    treasury: string
  }
  timestamp: string
}

let yieldCached: YieldDeployment | null = null
let pendingYield: Promise<YieldDeployment | null> | null = null

/**
 * Fetch the yield deployment manifest. Returns null if the manifest isn't present (e.g., a
 * deployment that doesn't include yield contracts). Cached in memory after the first call;
 * callers can rely on subsequent calls being cheap.
 */
export async function loadYieldDeployment(): Promise<YieldDeployment | null> {
  if (yieldCached) return yieldCached
  // Single-flight — readPathConfig calls this twice (vault + adapter) across several readers on unlock,
  // so coalesce concurrent callers onto one fetch. Cleared on settle: a failure (returns null without
  // caching) retries next call; a success falls through to `yieldCached`.
  if (pendingYield) return pendingYield
  const p: Promise<YieldDeployment | null> = (async (): Promise<YieldDeployment | null> => {
    const cfg = getNetworkConfig()
    const suffix = cfg.mode === 'sepolia' ? '-sepolia' : ''
    const name = `yield-hub${suffix}.json`
    try {
      const res = await fetch(`/api/deployments/${name}`)
      if (!res.ok) return null
      yieldCached = (await res.json()) as YieldDeployment
      return yieldCached
    } catch {
      return null
    }
  })().finally(() => {
    if (pendingYield === p) pendingYield = null
  })
  pendingYield = p
  return p
}

export interface FeeModuleDeployment {
  chainId: number
  contracts: {
    feeModuleProxy: string
  }
}

let feeModuleCached: `0x${string}` | null | undefined
let pendingFeeModule: Promise<`0x${string}` | null> | null = null

/** ArmadaFeeModule proxy on the hub chain — used for on-chain shield fee quotes. */
export async function loadFeeModuleAddress(): Promise<`0x${string}` | null> {
  if (feeModuleCached !== undefined) return feeModuleCached
  // Single-flight: coalesce concurrent callers onto one fetch. `feeModuleCached` caches the failure
  // (null) too, matching the prior behavior — a missing fee module is a stable answer, not a retry.
  if (pendingFeeModule) return pendingFeeModule
  const p: Promise<`0x${string}` | null> = (async (): Promise<`0x${string}` | null> => {
    const cfg = getNetworkConfig()
    const suffix = cfg.mode === 'sepolia' ? '-sepolia' : ''
    const name = `fee-module-hub${suffix}.json`
    try {
      const res = await fetch(`/api/deployments/${name}`)
      if (!res.ok) {
        feeModuleCached = null
        return null
      }
      const json = (await res.json()) as FeeModuleDeployment
      const addr = json.contracts?.feeModuleProxy
      feeModuleCached =
        addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? (addr as `0x${string}`) : null
      return feeModuleCached
    } catch {
      feeModuleCached = null
      return null
    }
  })().finally(() => {
    if (pendingFeeModule === p) pendingFeeModule = null
  })
  pendingFeeModule = p
  return p
}
