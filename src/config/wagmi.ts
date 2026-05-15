// ABOUTME: wagmi + RainbowKit configuration — multi-chain (hub + clients) derived from network.ts.
// ABOUTME: Local mode registers Anvil chains; sepolia mode registers Sepolia + Base/Arb Sepolia.

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { sepolia, baseSepolia, arbitrumSepolia, hardhat } from 'wagmi/chains'
import type { Chain } from 'wagmi/chains'
import { getNetworkConfig, isLocalMode, type ChainIdentity } from './network'

const ANVIL_HUB: Chain = {
  ...hardhat,
  id: 31337,
  name: 'Anvil Hub',
  rpcUrls: { default: { http: ['http://localhost:8545'] } },
}

const ANVIL_CLIENT_A: Chain = {
  ...hardhat,
  id: 31338,
  name: 'Anvil Client A',
  rpcUrls: { default: { http: ['http://localhost:8546'] } },
}

const ANVIL_CLIENT_B: Chain = {
  ...hardhat,
  id: 31339,
  name: 'Anvil Client B',
  rpcUrls: { default: { http: ['http://localhost:8547'] } },
}

function resolveChainsForMode(): readonly [Chain, ...Chain[]] {
  if (isLocalMode()) return [ANVIL_HUB, ANVIL_CLIENT_A, ANVIL_CLIENT_B]
  return [sepolia, baseSepolia, arbitrumSepolia]
}

function buildTransports(chains: readonly Chain[], chainIdentities: readonly ChainIdentity[]) {
  const transports: Record<number, ReturnType<typeof http>> = {}
  for (const chain of chains) {
    const identity = chainIdentities.find(c => c.chainId === chain.id)
    const primaryRpc = identity?.rpcUrls[0]
    transports[chain.id] = http(primaryRpc)
  }
  return transports
}

const chains = resolveChainsForMode()
const cfg = getNetworkConfig()

export const wagmiConfig = getDefaultConfig({
  appName: 'Armada',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'armada-dev-placeholder',
  chains: chains as unknown as readonly [Chain, ...Chain[]],
  transports: buildTransports(chains, [cfg.hub, ...cfg.clients]),
  ssr: false,
})
