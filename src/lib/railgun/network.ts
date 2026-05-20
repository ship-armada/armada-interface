// ABOUTME: Railgun engine network loader — patches the SDK's NETWORK_CONFIG to point at our PrivacyPool deployment, then loads the hub provider.
// ABOUTME: Always uses NetworkName.Hardhat so the SDK's QuickSync doesn't try to pull real Railgun history; we patch chain.id for Sepolia mode.

import { ethers } from 'ethers'
import { getNetworkConfig } from '@/config/network'
import { loadDeployments } from '@/config/deployments'

// Railgun SDK + shared-models imports are deferred — see lib/railgun/wallet.ts for why
// (jsdom + circomlibjs init crash). One dynamic import per session.
async function railgunWalletSdk() {
  return import('@railgun-community/wallet')
}
async function railgunSharedModels() {
  return import('@railgun-community/shared-models')
}

/**
 * Railgun-side network identity for our hub. We always pin to `Hardhat` because the SDK's
 * QuickSync for real networks (Ethereum_Sepolia, Mainnet, etc.) tries to download historical
 * commitments that don't match our POC deployment. Hardhat has no QuickSync, so the SDK only
 * scans events from our own PrivacyPool contract.
 *
 * In Sepolia mode we ALSO patch the Hardhat entry's chain.id to the real Sepolia id (11155111)
 * so `networkForChain({type:0, id:11155111})` resolves to our patched Hardhat entry, AND
 * neutralize the real Ethereum_Sepolia entry so it doesn't shadow ours.
 */
const RAILGUN_NETWORK_KEY = 'Hardhat'

function sdkPollIntervalMs(): number {
  return getNetworkConfig().mode === 'sepolia' ? 15_000 : 2_000
}

/**
 * Deployment block of our PrivacyPool — the SDK scans events from this block forward.
 * Local Anvil = 0 (full history is tiny); Sepolia = ~deployment block to avoid scanning millions
 * of empty blocks. Update when the Sepolia deployment moves.
 */
function deploymentBlock(): number {
  return getNetworkConfig().mode === 'sepolia' ? 10_321_000 : 0
}

let networkConfigPatched = false
let hubNetworkLoaded = false

function patchNetworkConfig(
  networkConfig: Record<string, Record<string, unknown>>,
  privacyPoolAddress: string,
  relayAdaptContract: string | undefined,
): void {
  if (networkConfigPatched) return

  const target = networkConfig[RAILGUN_NETWORK_KEY]
  if (!target) {
    throw new Error(`[railgun.network] SDK NETWORK_CONFIG is missing the "${RAILGUN_NETWORK_KEY}" entry`)
  }

  target.proxyContract = privacyPoolAddress
  target.relayAdaptContract = relayAdaptContract ?? ethers.ZeroAddress
  target.relayAdaptHistory = relayAdaptContract ? [relayAdaptContract] : ['']
  target.deploymentBlock = deploymentBlock()
  target.poseidonMerkleAccumulatorV3Contract = ethers.ZeroAddress
  target.poseidonMerkleVerifierV3Contract = ethers.ZeroAddress
  target.tokenVaultV3Contract = ethers.ZeroAddress
  target.deploymentBlockPoseidonMerkleAccumulatorV3 = 0
  target.supportsV3 = false
  target.poi = undefined

  if (getNetworkConfig().mode === 'sepolia') {
    const hubChainId = getNetworkConfig().hub.chainId
    target.chain = { type: 0, id: hubChainId }
    // Neutralize the real Ethereum_Sepolia entry so `networkForChain({type:0, id:11155111})`
    // resolves to our patched Hardhat entry, not the real one. If we didn't do this, the SDK
    // would try to call its built-in QuickSync against the real Railgun deployment.
    const sepoliaEntry = networkConfig['Ethereum_Sepolia']
    if (sepoliaEntry) sepoliaEntry.chain = { type: 0, id: -1 }
  }

  networkConfigPatched = true
}

/**
 * Load the hub network into the SDK's provider registry. Idempotent: subsequent calls return
 * immediately. Must run after `startRailgunEngine` (which `initRailgun` handles).
 *
 * Throws when the deployment manifest is missing a `privacyPool` address or when the configured
 * RPC URL has no PrivacyPool code (typically: Anvil isn't running, contracts not deployed).
 */
export async function loadHubNetwork(): Promise<void> {
  if (hubNetworkLoaded) return

  const [{ loadProvider }, { NETWORK_CONFIG, NetworkName }] = await Promise.all([
    railgunWalletSdk(),
    railgunSharedModels(),
  ])

  const deployments = await loadDeployments()
  const hubChainId = getNetworkConfig().hub.chainId
  const hubChain = getNetworkConfig().hub
  const privacyPool = deployments.hub.contracts.privacyPool
  if (!privacyPool) {
    throw new Error('[railgun.network] hub deployment is missing contracts.privacyPool')
  }

  // We don't currently surface a yield adapter through the new app's deployment schema; pass
  // ZeroAddress for the relayAdapt entry. When the Yield modal needs adapt-based proofs we'll
  // wire the address through deployments.ts and re-patch here.
  patchNetworkConfig(
    NETWORK_CONFIG as unknown as Record<string, Record<string, unknown>>,
    privacyPool,
    undefined,
  )

  // Sanity check: the configured RPC must respond with PrivacyPool bytecode at the expected
  // address. Cheap up-front check — saves a much more confusing error later when the SDK tries
  // to scan events from an empty contract.
  const primaryRpc = hubChain.rpcUrls[0]
  if (!primaryRpc) {
    throw new Error('[railgun.network] hub chain has no configured RPC URLs')
  }
  const provider = new ethers.JsonRpcProvider(primaryRpc)
  const code = await provider.getCode(privacyPool)
  if (!code || code === '0x') {
    throw new Error(
      `[railgun.network] no PrivacyPool code at ${privacyPool} on ${primaryRpc}. ` +
        'Run `npm run chains` + `npm run setup` from the repo root.',
    )
  }

  // Single-provider fallback config (weight 2 is required for the SDK's quorum check even with
  // one provider). Stall timeout differs by network — testnet RPCs are slower / chattier.
  const fallbackConfig = {
    chainId: hubChainId,
    providers: [
      {
        provider: primaryRpc,
        priority: 1,
        weight: 2,
        maxLogsPerBatch: 10,
        stallTimeout: getNetworkConfig().mode === 'sepolia' ? 10_000 : 2_500,
      },
    ],
  }

  await loadProvider(fallbackConfig, NetworkName.Hardhat, sdkPollIntervalMs())
  hubNetworkLoaded = true
}

export function isHubNetworkLoaded(): boolean {
  return hubNetworkLoaded
}

/** Reset state — primarily for tests + dev hot-reload scenarios. */
export function resetNetworkLoaderState(): void {
  hubNetworkLoaded = false
  networkConfigPatched = false
}

/** The SDK-facing chain descriptor for the hub. Used by callers building tx contexts. */
export function getHubChainDescriptor(): { type: 0; id: number } {
  return { type: 0, id: getNetworkConfig().hub.chainId }
}
