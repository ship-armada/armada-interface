// ABOUTME: Abstraction over the underlying event/log data source — RPC or indexer.
// ABOUTME: Hooks consume EventSource; they never know whether bytes come from a node or a service.

import type { EventSource as EventSourceImpl } from './index'

/** Generic envelope for an indexed event. Feature passes refine these shapes. */
export interface RawCommitment {
  blockNumber: number
  txHash: `0x${string}`
  logIndex: number
  /** Opaque calldata — decoded by the consuming hook against the privacy-pool ABI. */
  data: `0x${string}`
  topics: ReadonlyArray<`0x${string}`>
}

export interface RawNullifier {
  blockNumber: number
  txHash: `0x${string}`
  logIndex: number
  /** keccak hash of the nullifier (used for double-spend detection). */
  hash: `0x${string}`
}

export interface RawTxLog {
  blockNumber: number
  txHash: `0x${string}`
  logIndex: number
  topics: ReadonlyArray<`0x${string}`>
  data: `0x${string}`
}

export interface FetchRange {
  fromBlock: number
  toBlock: number | 'latest'
  signal?: AbortSignal
}

export interface EventSource {
  /** Privacy-pool commitment events (shield + transact outputs). */
  getCommitments(range: FetchRange): Promise<RawCommitment[]>
  /** Nullifier events (spent commitments). */
  getNullifiers(range: FetchRange): Promise<RawNullifier[]>
  /** Generic tx-log fetcher for a specific address — used for receipt scans and CCTP MessageSent events. */
  getTxHistory(address: string, range: FetchRange): Promise<RawTxLog[]>
}

/** Type re-export so consumers can `import type { EventSource } from '@/lib/events'`. */
export type { EventSourceImpl as EventSourceFactory }
