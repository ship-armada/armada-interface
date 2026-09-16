// ABOUTME: CCTP helpers — MessageSent decoding from hub tx receipts + MessageReceived destination polling.
// ABOUTME: Iris API polling is deferred to when real-CCTP-mode flows land; mock + local flows correlate on the indexed `nonce` topic alone.

import { decodeEventLog, getAbiItem, keccak256, type Log } from 'viem'

export interface CctpMessageRef {
  /** Raw message bytes emitted by MessageTransmitter.MessageSent. */
  message: `0x${string}`
  /**
   * The 32 bytes at envelope offset [12, 44) — the "nonce" slot. In CCTP V2 this is
   * `bytes32(0)` on the source side; the destination's `MessageReceived` emits an Iris-assigned
   * `eventNonce` here that cannot be derived from the source-side message. Kept for diagnostics
   * only — destination log matching must use a hookData-based predicate, not this value.
   */
  nonce: `0x${string}`
  /**
   * keccak256(message). Used by the relayer as the Iris attestation key. NOT what appears as
   * the indexed `nonce` topic on the destination's MessageReceived event — that's Iris's
   * `eventNonce`. Kept here for log correlation against the relayer.
   */
  messageHash: `0x${string}`
}

/**
 * MessageTransmitter ABI fragment for the two events we care about. Mirrors `MockCCTPV2.sol`
 * exactly so the decoder works in local mode; the real CCTP V2 contract emits the same shape.
 */
export const CCTP_MESSAGE_TRANSMITTER_ABI = [
  { type: 'event', name: 'MessageSent', inputs: [{ name: 'message', type: 'bytes', indexed: false }] },
  {
    type: 'event',
    name: 'MessageReceived',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'sourceDomain', type: 'uint32', indexed: false },
      { name: 'nonce', type: 'bytes32', indexed: true },
      { name: 'sender', type: 'bytes32', indexed: false },
      { name: 'finalityThresholdExecuted', type: 'uint32', indexed: true },
      { name: 'messageBody', type: 'bytes', indexed: false },
    ],
  },
] as const

const MESSAGE_SENT_TOPIC = keccak256(
  new TextEncoder().encode('MessageSent(bytes)'),
)
const MESSAGE_RECEIVED_TOPIC = keccak256(
  new TextEncoder().encode('MessageReceived(address,uint32,bytes32,bytes32,uint32,bytes)'),
)

export function messageSentTopic(): `0x${string}` {
  return MESSAGE_SENT_TOPIC
}
export function messageReceivedTopic(): `0x${string}` {
  return MESSAGE_RECEIVED_TOPIC
}

/**
 * Extract the CCTP message reference from a hub tx receipt. Scans logs for a `MessageSent`
 * event emitted by the given MessageTransmitter address; the first match wins (our hub txs
 * only emit one CCTP message per call).
 *
 * Returns null when no matching log is found — the caller decides whether that's an error
 * or "try again later" (it shouldn't happen on a successful atomicCrossChainUnshield).
 *
 * Per the CCTP V2 envelope layout (see contracts/cctp/ICCTPV2.sol::MessageV2):
 *   version(4) | sourceDomain(4) | destDomain(4) | nonce(32) | sender(32) | recipient(32) | …
 * → nonce lives at bytes offset [12, 44).
 */
export function extractCctpMessageFromReceipt(opts: {
  logs: ReadonlyArray<Log>
  messageTransmitterAddress: `0x${string}`
}): CctpMessageRef | null {
  const expectedAddress = opts.messageTransmitterAddress.toLowerCase()
  const sentEvent = getAbiItem({ abi: CCTP_MESSAGE_TRANSMITTER_ABI, name: 'MessageSent' })
  for (const log of opts.logs) {
    if (log.address.toLowerCase() !== expectedAddress) continue
    if (log.topics[0] !== MESSAGE_SENT_TOPIC) continue
    try {
      const decoded = decodeEventLog({
        abi: [sentEvent],
        data: log.data,
        topics: log.topics,
      })
      const message = (decoded.args as { message: `0x${string}` }).message
      // Nonce at byte offset [12, 44). Strip 0x, take chars [24, 88) → 64 hex chars = 32 bytes.
      const raw = message.slice(2)
      if (raw.length < 88) continue // message shorter than the header — not a CCTP V2 envelope
      const nonceHex = `0x${raw.slice(24, 88)}` as `0x${string}`
      return {
        message,
        nonce: nonceHex,
        messageHash: keccak256(message),
      }
    } catch {
      // Decoder mismatch — skip and try the next log.
      continue
    }
  }
  return null
}

/**
 * Domains + final recipient parsed from a CCTP V2 message envelope. `sourceDomain`/`destinationDomain`
 * are the CCTP domain ids (map to a chain via `getChainByDomain`); `mintRecipient` is the BurnMessage's
 * final recipient as a 0x EVM address.
 */
export interface CctpMessageInfo {
  sourceDomain: number
  destinationDomain: number
  mintRecipient: `0x${string}`
}

/**
 * Parse a CCTP V2 message envelope (the `MessageSent` bytes) → domains + `mintRecipient`. Envelope
 * layout: `version(4) | sourceDomain(4) | destDomain(4) | nonce(32) | sender(32) | recipient(32) |
 * destinationCaller(32) | minFinality(4) | finalityExecuted(4) | messageBody(...)`; the BurnMessage
 * body is `version(4) | burnToken(32) | mintRecipient(32) | …`, so `mintRecipient` (the final EVM
 * recipient = last 20 bytes) sits at envelope byte offset 184. Returns null if the bytes are too short.
 */
export function readCctpMessage(message: `0x${string}`): CctpMessageInfo | null {
  const raw = message.slice(2)
  if (raw.length < 432) return null // shorter than header + BurnMessage.mintRecipient (byte 216)
  const u32 = (byteOffset: number): number => parseInt(raw.slice(byteOffset * 2, (byteOffset + 4) * 2), 16)
  return {
    sourceDomain: u32(4),
    destinationDomain: u32(8),
    // mintRecipient bytes32 at byte 184; the address is its last 20 bytes → hex [392, 432).
    mintRecipient: `0x${raw.slice(392, 432)}` as `0x${string}`,
  }
}

/** Cross-chain markers found in a hub tx's logs — the outbound send (xchain unshield) and/or the
 *  inbound mint (xchain shield), keyed off the CCTP MessageTransmitter events. */
export interface CctpReceiptInfo {
  /** From an outbound `MessageSent` (e.g. a cross-chain unshield): destination + final recipient. */
  sent?: { destinationDomain: number; mintRecipient: `0x${string}` }
  /** From an inbound `MessageReceived` (e.g. a cross-chain shield's hub mint): the origin domain. */
  receivedSourceDomain?: number
}

/**
 * Scan a hub tx's logs for the CCTP MessageTransmitter's `MessageSent` (outbound routing) and
 * `MessageReceived` (inbound source). Used by history recovery to detect that a recovered hub
 * shield/unshield was actually cross-chain and recover its source/destination. First match of each wins.
 */
export function readCctpFromLogs(opts: {
  logs: ReadonlyArray<Log>
  messageTransmitterAddress: `0x${string}`
}): CctpReceiptInfo {
  const addr = opts.messageTransmitterAddress.toLowerCase()
  const sentEvent = getAbiItem({ abi: CCTP_MESSAGE_TRANSMITTER_ABI, name: 'MessageSent' })
  const out: CctpReceiptInfo = {}
  for (const log of opts.logs) {
    if (log.address.toLowerCase() !== addr) continue
    if (log.topics[0] === MESSAGE_SENT_TOPIC && out.sent === undefined) {
      try {
        const decoded = decodeEventLog({ abi: [sentEvent], data: log.data, topics: log.topics })
        const info = readCctpMessage((decoded.args as { message: `0x${string}` }).message)
        if (info) out.sent = { destinationDomain: info.destinationDomain, mintRecipient: info.mintRecipient }
      } catch { /* decoder mismatch — skip */ }
    } else if (log.topics[0] === MESSAGE_RECEIVED_TOPIC && out.receivedSourceDomain === undefined) {
      try {
        const decoded = decodeEventLog({ abi: CCTP_MESSAGE_TRANSMITTER_ABI, data: log.data, topics: log.topics })
        out.receivedSourceDomain = Number((decoded.args as { sourceDomain: number | bigint }).sourceDomain)
      } catch { /* decoder mismatch — skip */ }
    }
  }
  return out
}

/**
 * Test whether a destination-chain log batch contains a `MessageReceived` event matching the
 * given nonce. Used by handlers polling for cross-chain delivery — match on the indexed nonce
 * topic, which uniquely identifies the message envelope (no false positives from unrelated
 * USDC mints, unlike polling the recipient's balance).
 */
export function findMessageReceivedByNonce(opts: {
  logs: ReadonlyArray<Log>
  messageTransmitterAddress: `0x${string}`
  nonce: `0x${string}`
}): Log | null {
  const expectedAddress = opts.messageTransmitterAddress.toLowerCase()
  const expectedNonceTopic = opts.nonce.toLowerCase() as `0x${string}`
  for (const log of opts.logs) {
    if (log.address.toLowerCase() !== expectedAddress) continue
    if (log.topics[0] !== MESSAGE_RECEIVED_TOPIC) continue
    // `nonce` is the SECOND indexed topic (after `caller`). topics[0] = event sig, topics[1] = caller,
    // topics[2] = nonce, topics[3] = finalityThresholdExecuted.
    if (log.topics[2]?.toLowerCase() === expectedNonceTopic) {
      return log
    }
  }
  return null
}
