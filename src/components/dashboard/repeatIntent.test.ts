// ABOUTME: Tests for the receipt's "do it again" — which records offer it (settled / failed / cancelled sends, unshields,
// ABOUTME: shields and vault moves; never one still pending or unknown), the prefill each builds, its label and modal.

import { describe, it, expect } from 'vitest'
import { repeatIntentFor, repeatLabel, repeatModalFor } from './repeatIntent'
import type { TxError, TxRecord } from '@/lib/tx/types'
import { getNetworkConfig } from '@/config/network'

const HUB = getNetworkConfig().hub.chainId
const OWN = '0x00000000000000000000000000000000000000aa'

function rec(kind: TxRecord['kind'], meta: object, executionState: TxRecord['executionState'] = 'completed', error?: TxError): TxRecord {
  return {
    kind,
    meta,
    executionState,
    stage: 'hub-confirmed',
    stagesCompleted: [],
    artifacts: error ? { error } : {},
  } as unknown as TxRecord
}

describe('repeatIntentFor', () => {
  it('a private send repeats as a send to the same 0zk for the same amount', () => {
    expect(repeatIntentFor(rec('transfer-shielded', { amount: 5_500_000n, recipient: '0zk1qyalice' }), OWN)).toEqual({
      flow: 'send', recipient: '0zk1qyalice', amount: '5.5', destChainId: HUB,
    })
  })

  it('a public send repeats as a send to the same 0x on the same chain; to your own wallet, as an unshield', () => {
    expect(repeatIntentFor(rec('unshield-xchain', { amount: 2_000_000n, recipient: '0xBob', toChainId: 84532 }), OWN)).toEqual({
      flow: 'send', recipient: '0xBob', amount: '2', destChainId: 84532,
    })
    expect(repeatIntentFor(rec('unshield-local', { amount: 2_000_000n, recipient: OWN.toUpperCase().replace('0X', '0x') }), OWN)).toEqual({
      flow: 'unshield', amount: '2', toChainId: HUB,
    })
    expect(repeatIntentFor(rec('unshield-xchain', { amount: 2_000_000n, recipient: OWN, toChainId: 84532 }), OWN)).toEqual({
      flow: 'unshield', amount: '2', toChainId: 84532,
    })
  })

  it('a shield repeats from the same chain; a vault move in the same direction', () => {
    expect(repeatIntentFor(rec('shield-xchain', { amount: 10_000_000n, fromChainId: 84532 }), OWN)).toEqual({
      flow: 'shield', amount: '10', fromChainId: 84532,
    })
    expect(repeatIntentFor(rec('yield-deposit', { amount: 1_250_000n }), OWN)).toEqual({ flow: 'earn', direction: 'add', amount: '1.25' })
    expect(repeatIntentFor(rec('yield-withdraw', { amount: 1_000_001n, shares: 1n }), OWN)).toEqual({
      flow: 'earn', direction: 'withdraw', amount: '1.000001',
    })
  })

  it('a failed or cancelled tx can be repeated too', () => {
    const failed = rec('transfer-shielded', { amount: 1_000_000n, recipient: '0zk1qyalice' }, 'failed', { code: 'FEE_EXPIRED', message: 'x' })
    expect(repeatIntentFor(failed, OWN)?.flow).toBe('send')
    const cancelled = rec('transfer-shielded', { amount: 1_000_000n, recipient: '0zk1qyalice' }, 'cancelled', { code: 'CANCELLED', message: '' })
    expect(repeatIntentFor(cancelled, OWN)?.flow).toBe('send')
  })

  it('never for a tx still pending or with an unknown outcome — repeating it could pay twice', () => {
    expect(repeatIntentFor(rec('transfer-shielded', { amount: 1n, recipient: '0zk1' }, 'active'), OWN)).toBeNull()
    const lost = rec('transfer-shielded', { amount: 1n, recipient: '0zk1' }, 'failed', { code: 'POLL_TIMEOUT', message: 'x' })
    expect(repeatIntentFor(lost, OWN)).toBeNull()
  })

  it('not for a received payment, or a merge', () => {
    expect(repeatIntentFor(rec('transfer-shielded-received', { amount: 1n }), OWN)).toBeNull()
    expect(repeatIntentFor(rec('consolidate', { amount: 0n }), OWN)).toBeNull()
  })
})

describe('repeatLabel / repeatModalFor', () => {
  it('names the action and opens the flow (and tab) it repeats', () => {
    const cases = [
      [{ flow: 'send', recipient: '0zk1', amount: '1', destChainId: HUB }, 'Send again', 'payment'],
      [{ flow: 'unshield', amount: '1', toChainId: HUB }, 'Unshield again', 'unshield'],
      [{ flow: 'shield', amount: '1', fromChainId: HUB }, 'Shield again', 'shield'],
      [{ flow: 'earn', direction: 'add', amount: '1' }, 'Deposit again', 'yield-deposit'],
      [{ flow: 'earn', direction: 'withdraw', amount: '1' }, 'Withdraw again', 'yield-withdraw'],
    ] as const
    for (const [intent, label, modal] of cases) {
      expect(repeatLabel(intent)).toBe(label)
      expect(repeatModalFor(intent)).toBe(modal)
    }
  })
})
