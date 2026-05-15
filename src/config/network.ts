// ABOUTME: Network configuration for armada-interface — hub + client chain identities, RPC URLs, indexer/relayer/Iris endpoints.
// ABOUTME: Driven by VITE_NETWORK env var (local | sepolia). All multi-chain config flows from here.

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

export interface NetworkConfig {
  readonly mode: NetworkMode
  readonly hub: ChainIdentity
  readonly clients: readonly ChainIdentity[]
  readonly relayerUrl: string
  readonly irisUrl: string
  readonly indexerUrl: string | null
  /** RPC + balance polling cadence. Shorter on local, longer on testnet. */
  readonly pollIntervalMs: number
}

export function getNetworkMode(): NetworkMode {
  return import.meta.env.VITE_NETWORK === 'sepolia' ? 'sepolia' : 'local'
}

export function isLocalMode(): boolean {
  return getNetworkMode() === 'local'
}

const LOCAL_HUB: ChainIdentity = {
  chainId: 31337,
  domain: 0,
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

function sepoliaConfig(): NetworkConfig {
  const sepoliaRpcPrimary = (import.meta.env.VITE_SEPOLIA_RPC as string | undefined)
    ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  const sepoliaRpcFallback = import.meta.env.VITE_SEPOLIA_RPC_FALLBACK as string | undefined

  // Base Sepolia + Arbitrum Sepolia are the production-style client chains per CCTP docs;
  // the exact pairing matches what the relayer + deployments expect.
  const baseSepoliaRpc = (import.meta.env.VITE_BASE_SEPOLIA_RPC as string | undefined)
    ?? 'https://sepolia.base.org'
  const arbSepoliaRpc = (import.meta.env.VITE_ARB_SEPOLIA_RPC as string | undefined)
    ?? 'https://sepolia-rollup.arbitrum.io/rpc'

  return {
    mode: 'sepolia',
    hub: {
      chainId: 11155111,
      domain: 0,
      name: 'Ethereum Sepolia',
      rpcUrls: sepoliaRpcFallback ? [sepoliaRpcPrimary, sepoliaRpcFallback] : [sepoliaRpcPrimary],
      explorerUrl: 'https://sepolia.etherscan.io',
    },
    clients: [
      {
        chainId: 84532,
        domain: 6,
        name: 'Base Sepolia',
        rpcUrls: [baseSepoliaRpc],
        explorerUrl: 'https://sepolia.basescan.org',
      },
      {
        chainId: 421614,
        domain: 3,
        name: 'Arbitrum Sepolia',
        rpcUrls: [arbSepoliaRpc],
        explorerUrl: 'https://sepolia.arbiscan.io',
      },
    ],
    relayerUrl: (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? 'http://localhost:3001',
    irisUrl: (import.meta.env.VITE_IRIS_URL as string | undefined) ?? 'https://iris-api-sandbox.circle.com',
    indexerUrl: (import.meta.env.VITE_INDEXER_URL as string | undefined) ?? null,
    pollIntervalMs: 15_000,
  }
}

function localConfig(): NetworkConfig {
  return {
    mode: 'local',
    hub: LOCAL_HUB,
    clients: [LOCAL_CLIENT_A, LOCAL_CLIENT_B],
    relayerUrl: (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? 'http://localhost:3001',
    // Iris URL is unused in local mode (CCTP relays via mock module), but populate for type completeness.
    irisUrl: 'https://iris-api-sandbox.circle.com',
    indexerUrl: null,
    pollIntervalMs: 5_000,
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
