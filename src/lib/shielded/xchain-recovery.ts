// ABOUTME: Cross-chain history recovery — correlates recovered hub shields/unshields with the hub CCTP
// ABOUTME: MessageReceived (source) / MessageSent (destination) events so they remap to their xchain kinds.

import type { Log } from 'viem'
import type { HistoryEntry } from '@armada/sdk'
import { readCctpFromLogs } from '../cctp'
import { timeoutProvider } from './network'

/** The cross-chain routing recovered for one hub txid. */
export interface XchainCctp {
  /** Origin CCTP domain — set when the hub tx carried a `MessageReceived` (a cross-chain shield). */
  sourceDomain?: number
  /** Destination CCTP domain — set when the hub tx carried a `MessageSent` (a cross-chain unshield). */
  destinationDomain?: number
  /** Final EVM recipient on the destination chain (cross-chain unshield). */
  recipient?: `0x${string}`
  /** Cross-chain shield: the true deposit (CCTP burn amount, pre-fee) from the hub MessageReceived. */
  burnAmount?: bigint
  /** Cross-chain shield: the actual CCTP fee (`feeExecuted`) charged on the mint. */
  cctpFee?: bigint
}

// How many receipt fetches to run at once. Cross-chain candidates are a minority of history, but a
// heavy wallet's first recovery can have many — bound the fan-out so we don't hammer the RPC.
const RECEIPT_FETCH_CONCURRENCY = 6

/**
 * Build a `txid → XchainCctp` map by fetching the hub receipt for each cross-chain candidate and
 * scanning its logs for the CCTP MessageTransmitter events. Candidates are every `shield` (a hub
 * shield could be a cross-chain mint) and every `unshield` addressed to the pool (the pool is the
 * unshield recipient on a cross-chain exit — a local unshield goes straight to an EOA).
 *
 * Best-effort: a receipt that can't be fetched or carries no CCTP event simply isn't in the map, so
 * the mapper falls back to the same-chain kind. Never throws — a flaky RPC must not fail recovery.
 */
export async function buildXchainCctpMap(opts: {
  entries: ReadonlyArray<Pick<HistoryEntry, 'txid' | 'category' | 'recipient'>>
  poolAddress: string
  transmitterAddress: `0x${string}`
  hubRpcUrl: string
}): Promise<Map<string, XchainCctp>> {
  const pool = opts.poolAddress.toLowerCase()
  const candidates = new Set<string>()
  for (const e of opts.entries) {
    if (e.category === 'shield') candidates.add(e.txid)
    else if (e.category === 'unshield' && e.recipient?.toLowerCase() === pool) candidates.add(e.txid)
  }

  const map = new Map<string, XchainCctp>()
  if (candidates.size === 0) return map

  const provider = timeoutProvider(opts.hubRpcUrl)
  const txids = [...candidates]
  for (let i = 0; i < txids.length; i += RECEIPT_FETCH_CONCURRENCY) {
    const batch = txids.slice(i, i + RECEIPT_FETCH_CONCURRENCY)
    await Promise.allSettled(
      batch.map(async (txid) => {
        const hash = `0x${txid.replace(/^0x/, '')}`
        const receipt = await provider.getTransactionReceipt(hash)
        if (receipt === null) return
        const info = readCctpFromLogs({
          logs: receipt.logs as unknown as ReadonlyArray<Log>,
          messageTransmitterAddress: opts.transmitterAddress,
        })
        const entry: XchainCctp = {}
        if (info.received !== undefined) {
          entry.sourceDomain = info.received.sourceDomain
          if (info.received.burnAmount !== undefined) entry.burnAmount = info.received.burnAmount
          if (info.received.cctpFee !== undefined) entry.cctpFee = info.received.cctpFee
        }
        if (info.sent !== undefined) {
          entry.destinationDomain = info.sent.destinationDomain
          entry.recipient = info.sent.mintRecipient
        }
        if (entry.sourceDomain !== undefined || entry.destinationDomain !== undefined) map.set(txid, entry)
      }),
    )
  }
  return map
}
