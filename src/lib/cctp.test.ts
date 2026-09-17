// ABOUTME: Unit tests for the CCTP message parsers used by cross-chain history recovery.

import { describe, it, expect } from 'vitest'
import {
  readCctpMessage,
  readBurnMessage,
  readCctpFromLogs,
  messageSentTopic,
  messageReceivedTopic,
  CCTP_MESSAGE_TRANSMITTER_ABI,
} from './cctp'
import { encodeAbiParameters, encodeEventTopics } from 'viem'

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

// A full CCTP V2 BurnMessage body: version(4) | burnToken(32) | mintRecipient(32) | amount(32) |
// messageSender(32) | maxFee(32) | feeExecuted(32). amount sits at byte 68, feeExecuted at byte 164.
function buildBurnMessage(amount: bigint, feeExecuted: bigint): `0x${string}` {
  const u32 = (n: number) => n.toString(16).padStart(8, '0')
  const word = (n: bigint) => n.toString(16).padStart(64, '0')
  return `0x${u32(1)}${word(0n)}${word(0n)}${word(amount)}${word(0n)}${word(0n)}${word(feeExecuted)}` as `0x${string}`
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

describe('readBurnMessage', () => {
  it('parses the burn amount + executed fee from a BurnMessage body', () => {
    const body = buildBurnMessage(3_000_000n, 25_000n)
    expect(readBurnMessage(body)).toEqual({ amount: 3_000_000n, feeExecuted: 25_000n })
  })

  it('returns null for a body too short to hold feeExecuted', () => {
    expect(readBurnMessage('0xdeadbeef')).toBeNull()
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
    expect(info.received).toBeUndefined()
  })

  it('extracts source domain + burnAmount + cctpFee from a MessageReceived log', () => {
    // Indexed topics: caller, nonce, finalityThresholdExecuted. Non-indexed data: sourceDomain,
    // sender, messageBody — the order the ABI declares them.
    const topics = encodeEventTopics({
      abi: CCTP_MESSAGE_TRANSMITTER_ABI,
      eventName: 'MessageReceived',
      args: {
        caller: '0x4d25f9d0b0cd67f6fb2e6e1f2e9b072e750b0c30',
        nonce: `0x${'00'.repeat(32)}`,
        finalityThresholdExecuted: 2000,
      },
    })
    const data = encodeAbiParameters(
      [
        { name: 'sourceDomain', type: 'uint32' },
        { name: 'sender', type: 'bytes32' },
        { name: 'messageBody', type: 'bytes' },
      ],
      [6, `0x${'00'.repeat(32)}`, buildBurnMessage(3_000_000n, 25_000n)],
    )
    const info = readCctpFromLogs({
      logs: [{ address: TRANSMITTER, topics, data } as never],
      messageTransmitterAddress: TRANSMITTER,
    })
    expect(info.received).toEqual({ sourceDomain: 6, burnAmount: 3_000_000n, cctpFee: 25_000n })
    expect(info.sent).toBeUndefined()
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
