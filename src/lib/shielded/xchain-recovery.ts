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
  /** Destination CCTP domain — set when the hub tx carried a `MessageSent` (a cross-chain unshield). The final
   *  recipient isn't read from the message: its `mintRecipient` is the destination pool, not the user — the recovered
   *  entry's recipient (its `Unshield` event's `to`) is the user's wallet. */
  destinationDomain?: number
  /** Cross-chain shield: the true deposit (CCTP burn amount, pre-fee) from the hub MessageReceived. */
  burnAmount?: bigint
  /** Cross-chain shield: the actual CCTP fee (`feeExecuted`) charged on the mint. */
  cctpFee?: bigint
  /** Cross-chain shield: the hub MessageReceived's body. Its hook data carries the shield request's marker
   *  (`encryptedBundle[0]`), which finds the authored record when it never learned this hub mint (#77). */
  messageBody?: `0x${string}`
  /** Cross-chain unshield: the CCTP `maxFee` the burn bound (the review estimate × 2 — `cctpMaxFeeForKind`).
   *  Its actual fee is only known on the destination chain. */
  maxFee?: bigint
}

// How many receipt fetches to run at once. Cross-chain candidates are a minority of history, but a
// heavy wallet's first recovery can have many — bound the fan-out so we don't hammer the RPC.
const RECEIPT_FETCH_CONCURRENCY = 6

/**
 * Build a `txid → XchainCctp` map by fetching the hub receipt for each cross-chain candidate and
 * scanning its logs for the CCTP MessageTransmitter events. Candidates are every `shield` (a hub
 * shield could be a cross-chain mint) and every `unshield` (a cross-chain exit emits the same
 * `Unshield(finalRecipient, …)` a local one does, so only the CCTP `MessageSent` in its tx tells it apart).
 *
 * Best-effort: a receipt that can't be fetched or carries no CCTP event simply isn't in the map, so
 * the mapper falls back to the same-chain kind. Never throws — a flaky RPC must not fail recovery.
 */
export async function buildXchainCctpMap(opts: {
  entries: ReadonlyArray<Pick<HistoryEntry, 'txid' | 'category'>>
  transmitterAddress: `0x${string}`
  hubRpcUrl: string
}): Promise<Map<string, XchainCctp>> {
  const candidates = new Set<string>()
  for (const e of opts.entries) {
    if (e.category === 'shield' || e.category === 'unshield') candidates.add(e.txid)
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
          entry.messageBody = info.received.messageBody
        }
        if (info.sent !== undefined) {
          entry.destinationDomain = info.sent.destinationDomain
          if (info.sent.maxFee !== undefined) entry.maxFee = info.sent.maxFee
        }
        if (entry.sourceDomain !== undefined || entry.destinationDomain !== undefined) map.set(txid, entry)
      }),
    )
  }
  return map
}
