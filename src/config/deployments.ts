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
  }
  cctp: {
    tokenMessenger: string
    messageTransmitter: string
    usdc: string
  }
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
  timestamp: string
}

export interface ResolvedDeployments {
  hub: PrivacyPoolHubDeployment
  clients: PrivacyPoolClientDeployment[]
}

/**
 * Manifest naming convention per `config/networks.ts`:
 *   local:    privacy-pool-hub.json, privacy-pool-client.json, privacy-pool-clientB.json
 *   sepolia:  privacy-pool-hub-sepolia.json, etc.
 *
 * The 2nd client uses the suffix "clientB" (not "client2"); this is historical.
 */
function manifestName(role: 'hub' | 'client' | 'clientB'): string {
  const cfg = getNetworkConfig()
  const suffix = cfg.mode === 'sepolia' ? '-sepolia' : ''
  return `privacy-pool-${role}${suffix}.json`
}

async function fetchManifest<T>(name: string): Promise<T> {
  const res = await fetch(`/api/deployments/${name}`)
  if (!res.ok) {
    throw new Error(
      `Deployment manifest not found: ${name}. Run \`npm run setup\` from the project root first.`,
    )
  }
  return (await res.json()) as T
}

let cached: ResolvedDeployments | null = null

export async function loadDeployments(): Promise<ResolvedDeployments> {
  if (cached) return cached

  const cfg = getNetworkConfig()
  const hub = await fetchManifest<PrivacyPoolHubDeployment>(manifestName('hub'))

  // Two clients today (clientA + clientB). Mapped to the network config's `clients[]` order.
  const clientNames: ReadonlyArray<'client' | 'clientB'> = ['client', 'clientB']
  const clients: PrivacyPoolClientDeployment[] = []
  for (const role of clientNames.slice(0, cfg.clients.length)) {
    clients.push(await fetchManifest<PrivacyPoolClientDeployment>(manifestName(role)))
  }

  cached = { hub, clients }
  return cached
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
