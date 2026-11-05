// ABOUTME: Tests for canCancelBeforeBroadcast — Cancel is offered only while a relayer spend is still building its proof:
// ABOUTME: nothing has been sent, so cancelling is genuinely safe. Never for a shield (its wallet prompts may be open).

import { describe, it, expect } from 'vitest'
import type { TxKind, TxRecord } from './types'
import { canCancelBeforeBroadcast } from './cancelable'
import { txRecord } from '@/test/fixtures/txValues'

function rec(kind: TxKind, stage: string, overrides: Partial<TxRecord> = {}): TxRecord {
  return txRecord(kind, { amount: 1n }, { stage, executionState: 'active', ...overrides } as Partial<TxRecord>)
}

describe('canCancelBeforeBroadcast', () => {
  it.each<TxKind>(['transfer-shielded', 'unshield-local', 'unshield-xchain', 'yield-deposit', 'yield-withdraw', 'consolidate'])(
    'offers it while %s builds its proof',
    (kind) => {
      expect(canCancelBeforeBroadcast(rec(kind, 'build-proof'))).toBe(true)
    },
  )

  it('not once the submit has started (the relay request may already be on its way)', () => {
    expect(canCancelBeforeBroadcast(rec('transfer-shielded', 'submit-relayer'))).toBe(false)
  })

  it('not once broadcast, nor when settled', () => {
    expect(canCancelBeforeBroadcast(rec('transfer-shielded', 'build-proof', { artifacts: { sourceTxHash: '0xabc' } } as Partial<TxRecord>))).toBe(false)
    expect(canCancelBeforeBroadcast(rec('transfer-shielded', 'build-proof', { executionState: 'failed' }))).toBe(false)
  })

  it('never for a shield — its build-proof is the wallet prompts, which a cancel can\'t withdraw', () => {
    expect(canCancelBeforeBroadcast(rec('shield', 'build-proof'))).toBe(false)
    expect(canCancelBeforeBroadcast(rec('shield-xchain', 'build-proof'))).toBe(false)
  })
})
