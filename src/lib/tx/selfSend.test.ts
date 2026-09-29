// ABOUTME: Tests for selfSendAsMerge — a send to the wallet's own private address (only the fee left) is shown as a merge:
// ABOUTME: amount 0, the fee as its only charge — on the Activity row and receipt alike (spec PS-7, D3).

import { describe, it, expect } from 'vitest'
import { selfSendAsMerge } from './selfSend'
import { txFigures } from '@/lib/fees/txFigures'
import { A, F, txRecord } from '@/test/fixtures/txValues'

const OWN_0ZK = '0zk' + 'd'.repeat(40)
const send = (recipient: string) => txRecord('transfer-shielded', {
  amount: A, recipient, broadcasterFeeAmount: 2n * F, broadcasterFeePerProof: F, broadcasterShieldedAddress: '0zk_relayer',
})

describe('selfSendAsMerge', () => {
  it('a send to your own private address reads as a merge: amount 0, Fees = Total = the fee', () => {
    const shown = selfSendAsMerge(send(OWN_0ZK), OWN_0ZK)
    expect(shown.kind).toBe('consolidate')
    expect(shown.meta.amount).toBe(0n)
    expect(txFigures(shown)).toEqual({ model: 'merge', headline: 2n * F, fee: 2n * F })
  })

  it('keeps the record\'s identity and lifecycle', () => {
    const original = send(OWN_0ZK)
    const shown = selfSendAsMerge(original, OWN_0ZK)
    expect({ id: shown.id, stage: shown.stage, executionState: shown.executionState, artifacts: shown.artifacts })
      .toEqual({ id: original.id, stage: original.stage, executionState: original.executionState, artifacts: original.artifacts })
  })

  it('leaves a send to anyone else — and every record when the own address isn\'t known — as it is', () => {
    const other = send('0zk' + 'c'.repeat(40))
    expect(selfSendAsMerge(other, OWN_0ZK)).toBe(other)
    const own = send(OWN_0ZK)
    expect(selfSendAsMerge(own, undefined)).toBe(own)
  })
})
