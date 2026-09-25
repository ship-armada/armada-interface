// ABOUTME: Tests for the merge-notes intent — which token a failed spend needs merged and what it tried to do,
// ABOUTME: and the SDK dry-run request that reproduces that spend's circuit shape.

import { describe, it, expect } from 'vitest'
import { blockedActionLabel, blockedSpendRequest, mergeIntentFromRecord, mergeTokenSymbol } from './merge-intent'
import type { TxRecord } from '@/lib/tx/types'

const record = (kind: string, meta: Record<string, unknown>) => ({ kind, meta }) as unknown as TxRecord
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const

describe('mergeIntentFromRecord', () => {
  it('a blocked private send merges USDC and remembers its recipient + per-proof fee', () => {
    expect(
      mergeIntentFromRecord(record('transfer-shielded', { amount: 5n, recipient: '0zk_bob', broadcasterFeeAmount: 40n, broadcasterFeePerProof: 20n })),
    ).toEqual({ token: 'usdc', blocked: { kind: 'transfer-shielded', amount: 5n, recipient: '0zk_bob', perProofFee: 20n } })
  })

  it('a pre-split private send record uses its stored fee as the per-proof fee', () => {
    expect(mergeIntentFromRecord(record('transfer-shielded', { amount: 5n, recipient: '0zk_bob', broadcasterFeeAmount: 20n }))?.blocked?.perProofFee).toBe(20n)
  })

  it.each(['unshield-local', 'unshield-xchain', 'yield-deposit'])('a blocked %s merges USDC', (kind) => {
    expect(mergeIntentFromRecord(record(kind, { amount: 7n, broadcasterFeeAmount: 30n }))).toEqual({
      token: 'usdc',
      blocked: { kind, amount: 7n, perProofFee: 30n },
    })
  })

  it('a blocked vault withdrawal merges shares, with no fee note (its fee is taken contract-side)', () => {
    expect(mergeIntentFromRecord(record('yield-withdraw', { amount: 9n, shares: 8n, broadcasterFeeAmount: 30n }))).toEqual({
      token: 'shares',
      blocked: { kind: 'yield-withdraw', amount: 8n, perProofFee: 0n },
    })
  })

  it.each(['shield', 'shield-xchain', 'transfer-shielded-received', 'consolidate'])('%s has no merge to offer', (kind) => {
    expect(mergeIntentFromRecord(record(kind, { amount: 1n }))).toBeNull()
  })
})

describe('blockedSpendRequest', () => {
  it('a private send dry-runs as a transfer to its recipient', () => {
    expect(blockedSpendRequest({ kind: 'transfer-shielded', amount: 5n, recipient: '0zk_bob', perProofFee: 20n }, USDC)).toEqual({
      outputs: [{ to0zk: '0zk_bob', amount: 5n }],
      fee: { schedule: { transfer: '20' }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 },
      tokenAddress: USDC,
    })
  })

  it('everything else dry-runs as an unshield of the same value (same inputs, same outputs)', () => {
    const r = blockedSpendRequest({ kind: 'unshield-xchain', amount: 7n, perProofFee: 30n }, USDC)
    expect(r.outputs).toEqual([])
    expect(r.unshield?.amount).toBe(7n)
    expect(r.fee.schedule).toEqual({ transfer: '30' })
    expect(r.tokenAddress).toBe(USDC)
  })
})

describe('labels', () => {
  it('names the merged token', () => {
    expect(mergeTokenSymbol('usdc')).toBe('USDC')
    expect(mergeTokenSymbol('shares')).toBe('Vault shares')
  })

  it('names the blocked action in plain words', () => {
    expect(blockedActionLabel('transfer-shielded')).toBe('send')
    expect(blockedActionLabel('unshield-local')).toBe('withdrawal')
    expect(blockedActionLabel('unshield-xchain')).toBe('withdrawal')
    expect(blockedActionLabel('yield-deposit')).toBe('vault deposit')
    expect(blockedActionLabel('yield-withdraw')).toBe('vault withdrawal')
  })
})
