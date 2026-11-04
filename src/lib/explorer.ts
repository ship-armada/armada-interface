// ABOUTME: Compose block-explorer URLs from (chainId, txHash) using the per-chain explorerUrl in config/network; also exposes displayTxHash to pick the right hash for a record's error UI, and deliveryExplorerLink (a cross-chain tx's destination-mint link).
// ABOUTME: Returns null when either the chain is unknown or the chain has no explorerUrl configured — callers must handle the no-link case rather than rendering a broken anchor.

import { getChainById, getNetworkConfig } from '@/config/network'
import type { TxRecord } from '@/lib/tx/types'

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

/**
 * Pick the right txHash to surface in error UI for a record. Precedence:
 *   1. `record.artifacts.error.txHash` — the typed-error-carried hash. This wins because helpers
 *      like waitForReceiptOrFail attach a category-specific hash (e.g. the approve receipt's
 *      hash on a POLL_TIMEOUT during approve, not the still-unsubmitted shield tx hash).
 *   2. `record.artifacts.sourceTxHash` — the bare submitted-tx hash. Fallback for catch paths
 *      where no typed error is attached but we still know which on-chain tx is in flight.
 *
 * Returns undefined when neither is present (record never broadcast / pre-submit failure).
 */
export function displayTxHash(record: TxRecord | null | undefined): `0x${string}` | undefined {
  if (!record) return undefined
  const errHash = record.artifacts.error?.txHash
  if (errHash) return errHash
  const sourceHash = (record.artifacts as { sourceTxHash?: `0x${string}` }).sourceTxHash
  return sourceHash ?? undefined
}

/**
 * The explorer link for a cross-chain tx's DESTINATION transaction — the CCTP mint the relayer delivered
 * (`artifacts.destTxHash`). A cross-chain unshield mints on its `toChainId`; a cross-chain shield mints into the hub.
 * The receipt's main "View on explorer" link is the source-chain tx; this is the second half of the journey. Null
 * until delivery recorded the hash, for same-chain kinds, and when the chain has no explorer configured.
 */
export function deliveryExplorerLink(record: TxRecord): { url: string; chainName: string } | null {
  const destTxHash = (record.artifacts as { destTxHash?: `0x${string}` }).destTxHash
  if (!destTxHash) return null
  const chainId =
    record.kind === 'unshield-xchain' ? (record.meta as { toChainId?: number }).toChainId
    : record.kind === 'shield-xchain' ? getNetworkConfig().hub.chainId
    : undefined
  const url = txExplorerUrl(chainId, destTxHash)
  const chain = chainId !== undefined ? getChainById(chainId) : undefined
  return url && chain ? { url, chainName: chain.name } : null
}
