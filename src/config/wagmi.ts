// ABOUTME: wagmi + RainbowKit configuration — multi-chain (hub + clients) derived from network.ts.
// ABOUTME: Local mode registers Anvil chains; sepolia mode registers Sepolia + Base/Arb Sepolia.

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { fallback, http } from 'viem'
import type { Transport } from 'viem'
import { sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, hardhat } from 'wagmi/chains'
import type { Chain } from 'wagmi/chains'
import { getAllChainIdentities, type ChainIdentity } from './network'

/**
 * Canonical viem `Chain` objects keyed by chainId. These carry richer metadata (multicall3
 * address, native currency, block explorers) than we'd synthesize by hand, so we prefer them when
 * available. Purely ADDITIVE: which chains exist is driven by the network config — a chain absent
 * from this map still registers, built from its `ChainIdentity` by `synthesizeChain`. Add an entry
 * here only to attach canonical metadata for a new public chain; it's never the source of truth for
 * the chain set.
 */
const KNOWN_VIEM_CHAINS: Readonly<Record<number, Chain>> = {
  [sepolia.id]: sepolia,
  [baseSepolia.id]: baseSepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [optimismSepolia.id]: optimismSepolia,
}

/**
 * Build a minimal viem `Chain` from a `ChainIdentity` for chains with no canonical object (local
 * Anvil, or a freshly-added client before it's in `KNOWN_VIEM_CHAINS`). Bases on `hardhat` for the
 * ETH/18 native currency + testnet flag; RPC + explorer come from the identity.
 */
function synthesizeChain(identity: ChainIdentity): Chain {
  return {
    ...hardhat,
    id: identity.chainId,
    name: identity.name,
    rpcUrls: { default: { http: [...identity.rpcUrls] } },
    ...(identity.explorerUrl
      ? { blockExplorers: { default: { name: 'Explorer', url: identity.explorerUrl } } }
      : {}),
  }
}

function chainForIdentity(identity: ChainIdentity): Chain {
  return KNOWN_VIEM_CHAINS[identity.chainId] ?? synthesizeChain(identity)
}

// Exported for unit tests. Derives one wagmi `Chain` per active chain identity (hub + enabled
// clients), so N clients register N+1 chains with no per-count code.
export function resolveChainsForMode(): readonly [Chain, ...Chain[]] {
  const chains = getAllChainIdentities().map(chainForIdentity)
  return chains as unknown as readonly [Chain, ...Chain[]]
}

// Exported for unit tests (single vs fallback transport selection). App code uses `wagmiConfig`.
export function buildTransports(chains: readonly Chain[], chainIdentities: readonly ChainIdentity[]) {
  const transports: Record<number, Transport> = {}
  for (const chain of chains) {
    const identity = chainIdentities.find(c => c.chainId === chain.id)
    const urls = identity?.rpcUrls ?? []
    // Each URL gets a 15s timeout so a black-holed endpoint fails over promptly instead of
    // hanging on viem's default. With ≥2 configured URLs, `fallback` rotates to the next on
    // error (P1-18). Single-URL chains (all of local; sepolia without VITE_SEPOLIA_RPC_FALLBACK)
    // keep single-transport behavior. No identity → viem's default public RPC for the chain.
    if (urls.length === 0) {
      transports[chain.id] = http()
    } else if (urls.length === 1) {
      transports[chain.id] = http(urls[0], { timeout: 15_000 })
    } else {
      transports[chain.id] = fallback(urls.map(u => http(u, { timeout: 15_000 })))
    }
  }
  return transports
}

const chains = resolveChainsForMode()

export const wagmiConfig = getDefaultConfig({
  appName: 'Armada',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'armada-dev-placeholder',
  chains: chains as unknown as readonly [Chain, ...Chain[]],
  transports: buildTransports(chains, getAllChainIdentities()),
  ssr: false,
})
