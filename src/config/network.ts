// ABOUTME: Network configuration for armada-interface — hub + client chain identities, RPC URLs, indexer/relayer/Iris endpoints.
// ABOUTME: VITE_NETWORK picks the mode (local | sepolia); VITE_ENABLED_CLIENTS selects clients from the registry. All multi-chain config flows from here.

export type NetworkMode = 'local' | 'sepolia'

export interface ChainIdentity {
  readonly chainId: number
  /** CCTP domain id (0 = Ethereum, 6 = Base, etc.). */
  readonly domain: number
  readonly name: string
  /** Ordered RPC URLs — first is primary, rest are fallbacks. */
  readonly rpcUrls: readonly string[]
  /** Block explorer base URL. Undefined for local Anvil. */
  readonly explorerUrl?: string
}

/**
 * A single client chain in the per-mode client registry. The registry holds *every* known client;
 * an operator selects a subset at boot via `VITE_ENABLED_CLIENTS` (see `resolveEnabledClients`).
 * Adding a new client is one new entry here — no positional/count assumptions elsewhere.
 */
export interface ClientEntry {
  /**
   * Human-friendly stable id used by `VITE_ENABLED_CLIENTS` to enable/disable this client at boot
   * (e.g. `base-sepolia`). Operators enable by chain, not by the deploy tooling's positional role.
   */
  readonly key: string
  readonly identity: ChainIdentity
  /**
   * Whether this client is active when `VITE_ENABLED_CLIENTS` is unset. Defaults to `true` (omit for
   * the common case). Set `false` to catalog a client that isn't ready to run by default — e.g. its
   * deployment manifest isn't published yet — so it exists in the registry and can be turned on
   * explicitly via `VITE_ENABLED_CLIENTS` without breaking the default build.
   */
  readonly enabledByDefault?: boolean
}

export interface NetworkConfig {
  readonly mode: NetworkMode
  readonly hub: ChainIdentity
  readonly clients: readonly ChainIdentity[]
  readonly relayerUrl: string
  readonly irisUrl: string
  readonly indexerUrl: string | null
  /** RPC + balance polling cadence. Shorter on local, longer on testnet. */
  readonly pollIntervalMs: number
  /**
   * Max block span allowed in a single `eth_getLogs` request.
   *
   * Provider limits observed at time of writing:
   *   - Alchemy free tier: 10_000 blocks
   *   - Infura: 10_000 blocks (most methods)
   *   - publicnode.com endpoints: varies; some as low as 5_000
   *   - QuickNode free tier: 10_000
   *
   * 5_000 is half the common ceiling. The headroom covers (a) stricter-tier providers, (b)
   * filter complexity overhead some providers apply when topics/addresses match many logs, and
   * (c) future tightening without code change. Local Anvil has no cap, so we set a generous
   * value rather than disabling the chunker — keeps one code path for both environments.
   */
  readonly maxLogRange: number
  /**
   * Blocks to stay behind chain head when scanning the shielded pool (SDK `PoolConfig.confirmationDepth`).
   * A shallow reorg within this depth can't remove an already-persisted commitment leaf, avoiding the
   * SDK's blunt full-rescan self-heal. Trade-off: notes in the last N blocks aren't spendable until deeper.
   * 0 on local Anvil (instant finality, no reorgs); a small buffer on public testnets.
   */
  readonly confirmationDepth: number
  /**
   * Confirmations a note needs before it counts as **spendable** rather than **pending** in the
   * SDK's `balances()` view (SDK `PoolConfig.finalityThreshold`). Distinct from `confirmationDepth`:
   * that one governs which notes are *persisted at all* (reorg-safe tree); this one splits the
   * *visible* balance into spendable vs pending. For a visible pending window it must exceed
   * `confirmationDepth` — otherwise every persisted note is already deep enough to be spendable and
   * `pending` is always 0. On sepolia: invisible in blocks 0–`confirmationDepth`, pending in
   * `confirmationDepth`–`finalityThreshold`, spendable beyond. 0 on local Anvil (instant finality).
   */
  readonly finalityThreshold: number
}

export function getNetworkMode(): NetworkMode {
  return import.meta.env.VITE_NETWORK === 'sepolia' ? 'sepolia' : 'local'
}

export function isLocalMode(): boolean {
  return getNetworkMode() === 'local'
}

/**
 * Whether the UI should call the relayer HTTP API (`/fees`, `/relay`, `/health`, …). True when
 * the resolved `relayerUrl` is non-empty.
 *
 * Sepolia + unset `VITE_RELAYER_URL` now resolves to `''` → this is honestly `false` (P0-10), so
 * callers can disable gasless toggles, gate fee fetches, and render a "relayer not configured"
 * banner rather than firing requests at `localhost:3001`. Local mode keeps its `localhost:3001`
 * default (a relayer is expected to be running locally).
 */
export function isRelayerConfigured(): boolean {
  return getNetworkConfig().relayerUrl.length > 0
}

/**
 * Optional integrator address passed to `PrivacyPool.shield()` to route shield fees to a third
 * party. Defaults to ZeroAddress when unset or malformed (no fee-routing relationship).
 * Partners configure via `VITE_INTEGRATOR_ADDRESS` without touching code.
 */
export function getIntegratorAddress(): `0x${string}` {
  const raw = import.meta.env.VITE_INTEGRATOR_ADDRESS as string | undefined
  if (raw && /^0x[0-9a-fA-F]{40}$/.test(raw)) return raw as `0x${string}`
  return '0x0000000000000000000000000000000000000000'
}

// Local CCTP domains match config/networks.ts (HUB=100, CLIENT_A=101, CLIENT_B=102).
// Real CCTP domains (e.g. Ethereum=0, Base=6) are reserved for the `sepolia` mode.
const LOCAL_HUB: ChainIdentity = {
  chainId: 31337,
  domain: 100,
  name: 'Anvil Hub (local)',
  rpcUrls: ['http://localhost:8545'],
} as const

const LOCAL_CLIENT_A: ChainIdentity = {
  chainId: 31338,
  domain: 101,
  name: 'Anvil Client A (local)',
  rpcUrls: ['http://localhost:8546'],
} as const

const LOCAL_CLIENT_B: ChainIdentity = {
  chainId: 31339,
  domain: 102,
  name: 'Anvil Client B (local)',
  rpcUrls: ['http://localhost:8547'],
} as const

function localClientRegistry(): readonly ClientEntry[] {
  return [
    { key: 'anvil-client-a', identity: LOCAL_CLIENT_A },
    { key: 'anvil-client-b', identity: LOCAL_CLIENT_B },
  ]
}

function sepoliaClientRegistry(): readonly ClientEntry[] {
  // Base Sepolia + Arbitrum Sepolia are the production-style client chains per CCTP docs; the exact
  // pairing matches what the relayer + deployments expect. Per-client RPC overrides via env.
  const baseSepoliaRpc = (import.meta.env.VITE_BASE_SEPOLIA_RPC as string | undefined)
    ?? 'https://sepolia.base.org'
  const arbSepoliaRpc = (import.meta.env.VITE_ARB_SEPOLIA_RPC as string | undefined)
    ?? 'https://sepolia-rollup.arbitrum.io/rpc'
  const opSepoliaRpc = (import.meta.env.VITE_OP_SEPOLIA_RPC as string | undefined)
    ?? 'https://sepolia.optimism.io'
  return [
    {
      key: 'base-sepolia',
      identity: {
        chainId: 84532,
        domain: 6,
        name: 'Base Sepolia',
        rpcUrls: [baseSepoliaRpc],
        explorerUrl: 'https://sepolia.basescan.org',
      },
    },
    {
      key: 'arbitrum-sepolia',
      identity: {
        chainId: 421614,
        domain: 3,
        name: 'Arbitrum Sepolia',
        rpcUrls: [arbSepoliaRpc],
        explorerUrl: 'https://sepolia.arbiscan.io',
      },
      // Off by default: the canonical instance (demo3) ships Base + Optimism, not Arbitrum. Enable it
      // for an Arbitrum-bearing instance with VITE_ENABLED_CLIENTS=base-sepolia,arbitrum-sepolia.
      enabledByDefault: false,
    },
    {
      key: 'optimism-sepolia',
      identity: {
        chainId: 11155420,
        domain: 2,
        name: 'Optimism Sepolia',
        rpcUrls: [opSepoliaRpc],
        explorerUrl: 'https://sepolia-optimism.etherscan.io',
      },
      // On by default — part of the canonical demo3 client set (Base + Optimism). The manifest is
      // bound by embedded chainId, so it resolves whatever client<i> slot the deployment assigns it.
    },
  ]
}

/** The full client registry for a mode — every known client, before the enable-list filter. */
export function getClientRegistry(mode: NetworkMode): readonly ClientEntry[] {
  return mode === 'sepolia' ? sepoliaClientRegistry() : localClientRegistry()
}

/**
 * Resolve the active client identities from a registry given the raw `VITE_ENABLED_CLIENTS` value:
 *   - unset / empty / whitespace → the default-active clients (every entry except those marked
 *     `enabledByDefault: false`), in registry order (backward compatible for all-default registries).
 *   - a comma-separated subset of `key`s → those clients, in *registry* order (deterministic,
 *     independent of the order the operator listed them), including entries that are off by default.
 *     Surrounding whitespace + blank entries are ignored.
 *   - any unknown key → throws a descriptive boot error listing the valid keys. Fail-fast beats
 *     silently dropping a client the operator asked for.
 */
export function resolveEnabledClients(
  registry: readonly ClientEntry[],
  enabledCsv: string | undefined,
): readonly ChainIdentity[] {
  const keys = (enabledCsv ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (keys.length === 0) {
    return registry.filter(e => e.enabledByDefault !== false).map(e => e.identity)
  }
  const validKeys = registry.map(e => e.key)
  for (const k of keys) {
    if (!validKeys.includes(k)) {
      throw new Error(
        `VITE_ENABLED_CLIENTS: unknown client key "${k}". Valid keys: ${validKeys.join(', ')}.`,
      )
    }
  }
  return registry.filter(e => keys.includes(e.key)).map(e => e.identity)
}

/** Active client identities for a mode: the mode registry filtered by `VITE_ENABLED_CLIENTS`. */
function resolveClientsForMode(mode: NetworkMode): readonly ChainIdentity[] {
  return resolveEnabledClients(
    getClientRegistry(mode),
    import.meta.env.VITE_ENABLED_CLIENTS as string | undefined,
  )
}

function sepoliaConfig(): NetworkConfig {
  const sepoliaRpcPrimary = (import.meta.env.VITE_SEPOLIA_RPC as string | undefined)
    ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  const sepoliaRpcFallback = import.meta.env.VITE_SEPOLIA_RPC_FALLBACK as string | undefined

  return {
    mode: 'sepolia',
    hub: {
      chainId: 11155111,
      domain: 0,
      name: 'Ethereum Sepolia',
      rpcUrls: sepoliaRpcFallback ? [sepoliaRpcPrimary, sepoliaRpcFallback] : [sepoliaRpcPrimary],
      explorerUrl: 'https://sepolia.etherscan.io',
    },
    clients: resolveClientsForMode('sepolia'),
    // NO localhost fallback on sepolia (P0-10): a missing VITE_RELAYER_URL must yield '' so
    // `isRelayerConfigured()` is honestly false — not silently point the DEPLOYED app at the
    // visitor's own machine (and an http:// URL from an https:// page is blocked as mixed content
    // anyway). Set VITE_RELAYER_URL to the public HTTPS relayer for sepolia builds.
    relayerUrl: (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? '',
    irisUrl: (import.meta.env.VITE_IRIS_URL as string | undefined) ?? 'https://iris-api-sandbox.circle.com',
    indexerUrl: (import.meta.env.VITE_INDEXER_URL as string | undefined) ?? null,
    pollIntervalMs: 15_000,
    maxLogRange: 5_000,
    // Scan all the way to head (no hold-back): a note is visible the moment the SDK scans its block —
    // as fast as quick-sync + the post-tx catch-up poll deliver it (~seconds), the snappiest option for
    // the demo. Correctness does not depend on this value: the SDK self-heals any reorg that removes a
    // persisted leaf via a rescan from creationBlock. The cost of 0 (vs a 1-block buffer) is that on
    // Sepolia's common single-slot wobbles a note can briefly appear then vanish, and head instability
    // can trigger spurious root-mismatch → full-rescan churn. Raise to 1 if that churn/flicker shows.
    confirmationDepth: 0,
    // Equal to confirmationDepth: a note is spendable as soon as it's visible — no separate `pending`
    // window (the split still exists; the window is just zero-width). Raise above confirmationDepth to
    // surface freshly-scanned notes as `pending` before they're spendable, keeping the spendable subset
    // (MAX / fee-on-top guard) conservative for shallow, still-reorgable notes — at the cost of delaying
    // when a just-shielded note is re-spendable. Must stay ≥ confirmationDepth.
    finalityThreshold: 0,
  }
}

function localConfig(): NetworkConfig {
  return {
    mode: 'local',
    hub: LOCAL_HUB,
    clients: resolveClientsForMode('local'),
    relayerUrl: (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? 'http://localhost:3001',
    // Iris URL is unused in local mode (CCTP relays via mock module), but populate for type completeness.
    irisUrl: 'https://iris-api-sandbox.circle.com',
    // Honor VITE_INDEXER_URL so the watcher quick-sync path can be exercised against a locally-run
    // indexer (see the F5 local-testing recipe). Unset → null → engine slow scan (B4 invariant).
    indexerUrl: (import.meta.env.VITE_INDEXER_URL as string | undefined) ?? null,
    pollIntervalMs: 5_000,
    maxLogRange: 100_000,
    confirmationDepth: 0, // Anvil: instant finality, no reorgs
    finalityThreshold: 0, // Anvil: instant finality — every visible note is immediately spendable
  }
}

let cached: NetworkConfig | null = null

/** Returns the active network configuration. Memoised — the env doesn't change at runtime. */
export function getNetworkConfig(): NetworkConfig {
  if (cached) return cached
  cached = isLocalMode() ? localConfig() : sepoliaConfig()
  return cached
}

/** All known chains in priority order: hub first, then clients. Useful for multi-chain providers. */
export function getAllChainIdentities(): readonly ChainIdentity[] {
  const cfg = getNetworkConfig()
  return [cfg.hub, ...cfg.clients]
}

export function getChainById(chainId: number): ChainIdentity | undefined {
  return getAllChainIdentities().find(c => c.chainId === chainId)
}

export function getChainByDomain(domain: number): ChainIdentity | undefined {
  return getAllChainIdentities().find(c => c.domain === domain)
}
