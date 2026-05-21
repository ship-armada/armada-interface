// ABOUTME: Barrel + factory for the EventSource abstraction.
// ABOUTME: getEventSource() returns the configured implementation — indexer if URL is set, else RPC fallback.

import type { JsonRpcProvider } from 'ethers'
import { getNetworkConfig } from '@/config/network'
import { IndexerEventSource } from './IndexerEventSource'
import { RpcEventSource } from './RpcEventSource'

export type { EventSource, FetchRange, RawCommitment, RawNullifier, RawTxLog } from './EventSource'
export { RpcEventSource } from './RpcEventSource'
export { IndexerEventSource } from './IndexerEventSource'
export { getLogsChunked, type ChunkedLogsClient, type ChunkedLogsOptions } from './getLogsChunked'

/**
 * Resolve the active EventSource based on network config.
 *
 *  - If `indexerUrl` is set on the network, prefer `IndexerEventSource`.
 *  - Otherwise fall back to `RpcEventSource` against the supplied provider.
 *
 * Hubcontract address is required for RPC mode (the log filter target).
 */
export function getEventSource(args: {
  provider: JsonRpcProvider
  hubContractAddress: string
}): import('./EventSource').EventSource {
  const cfg = getNetworkConfig()
  if (cfg.indexerUrl) return new IndexerEventSource(cfg.indexerUrl)
  return new RpcEventSource(args.provider, args.hubContractAddress)
}
