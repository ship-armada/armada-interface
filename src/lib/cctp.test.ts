// ABOUTME: Unit tests for the CCTP message parsers used by cross-chain history recovery.

import { describe, it, expect } from 'vitest'
import { readCctpMessage, readCctpFromLogs, messageSentTopic, messageReceivedTopic } from './cctp'
import { encodeEventTopics } from 'viem'

const TRANSMITTER = '0xe737e5cebeeba77efe34d4aa090756590b1ce275' as const

// A real CCTP V2 MessageSent envelope from a hub xchain-unshield (Ethereum Sepolia → Base Sepolia):
// sourceDomain 0, destinationDomain 6, mintRecipient 0x4d25f9d0b0cd67f6fb2e6e1f2e9b072e750b0c30.
function buildMessage(sourceDomain: number, destDomain: number, recipient: string): `0x${string}` {
  const u32 = (n: number) => n.toString(16).padStart(8, '0')
  const word = (hex: string) => hex.padStart(64, '0')
  // envelope: version | src | dst | nonce | sender | recipient | destCaller | minFin | finExec | body...
  const header = u32(1) + u32(sourceDomain) + u32(destDomain) + word('') + word('') + word('') + word('') + u32(0) + u32(0)
  // BurnMessage body: version(4) | burnToken(32) | mintRecipient(32) | amount(32)
  const body = u32(1) + word('') + word(recipient.replace(/^0x/, '')) + word('')
  return `0x${header}${body}` as `0x${string}`
}

describe('readCctpMessage', () => {
  it('parses source/destination domains + mintRecipient from a V2 envelope', () => {
    const msg = buildMessage(0, 6, '0x4d25f9d0b0cd67f6fb2e6e1f2e9b072e750b0c30')
    expect(readCctpMessage(msg)).toEqual({
      sourceDomain: 0,
      destinationDomain: 6,
      mintRecipient: '0x4d25f9d0b0cd67f6fb2e6e1f2e9b072e750b0c30',
    })
  })

  it('returns null for a too-short (non-envelope) message', () => {
    expect(readCctpMessage('0xdeadbeef')).toBeNull()
  })
})

describe('readCctpFromLogs', () => {
  const sentTopics = encodeEventTopics({
    abi: [{ type: 'event', name: 'MessageSent', inputs: [{ name: 'message', type: 'bytes', indexed: false }] }],
    eventName: 'MessageSent',
  })

  it('extracts destination + recipient from a MessageSent log', () => {
    const message = buildMessage(0, 6, '0x4d25f9d0b0cd67f6fb2e6e1f2e9b072e750b0c30')
    // abi-encode the bytes arg: offset(32) + length(32) + padded data
    const raw = message.slice(2)
    const len = (raw.length / 2).toString(16).padStart(64, '0')
    const padded = raw.padEnd(Math.ceil(raw.length / 64) * 64, '0')
    const data = `0x${(32).toString(16).padStart(64, '0')}${len}${padded}` as `0x${string}`
    const info = readCctpFromLogs({
      logs: [{ address: TRANSMITTER, topics: sentTopics, data } as never],
      messageTransmitterAddress: TRANSMITTER,
    })
    expect(info.sent).toEqual({ destinationDomain: 6, mintRecipient: '0x4d25f9d0b0cd67f6fb2e6e1f2e9b072e750b0c30' })
    expect(info.receivedSourceDomain).toBeUndefined()
  })

  it('ignores logs from other addresses', () => {
    const info = readCctpFromLogs({
      logs: [{ address: '0x0000000000000000000000000000000000000001', topics: [messageSentTopic()], data: '0x' } as never],
      messageTransmitterAddress: TRANSMITTER,
    })
    expect(info.sent).toBeUndefined()
  })

  it('exposes the event topics', () => {
    expect(messageSentTopic()).toMatch(/^0x[0-9a-f]{64}$/)
    expect(messageReceivedTopic()).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
