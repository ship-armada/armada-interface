// ABOUTME: Compose block-explorer URLs from (chainId, txHash) using the per-chain explorerUrl in config/network.
// ABOUTME: Returns null when either the chain is unknown or the chain has no explorerUrl configured — callers must handle the no-link case rather than rendering a broken anchor.

import { getChainById } from '@/config/network'

/**
 * Build a tx-explorer URL for a chain we know about. Returns null when:
 *   - chainId isn't in our config (so we have no explorerUrl to start from)
 *   - the chain has no explorerUrl (local Anvil)
 *   - no txHash is supplied (the common "we don't have a hash yet" case)
 *
 * Always returns an absolute `/tx/<hash>` URL when not null. Callers should render the link
 * conditionally rather than show an empty anchor.
 */
export function txExplorerUrl(
  chainId: number | undefined,
  txHash: `0x${string}` | undefined,
): string | undefined {
  if (!chainId || !txHash) return undefined
  const chain = getChainById(chainId)
  if (!chain?.explorerUrl) return undefined
  return `${chain.explorerUrl}/tx/${txHash}`
}
