// ABOUTME: Unit tests for kindTitle / recordTitle — the mockup activity copy (deposit source chain, sent-to-recipient, vault
// ABOUTME: ops).

import { describe, it, expect } from 'vitest'
import { kindTitle, recordTitle } from './stageCopy'
import type { TxRecord } from '@/lib/tx/types'

describe('kindTitle', () => {
  it('returns the short title per kind', () => {
    expect(kindTitle('shield')).toBe('Shield')
    expect(kindTitle('unshield-local')).toBe('Unshield')
    expect(kindTitle('unshield-xchain')).toBe('Unshield')
    expect(kindTitle('transfer-shielded')).toBe('Private transfer')
    expect(kindTitle('transfer-shielded-received')).toBe('Received')
    expect(kindTitle('yield-deposit')).toBe('Vault deposit')
    expect(kindTitle('yield-withdraw')).toBe('Vault withdrawal')
  })
})

describe('recordTitle', () => {
  it('names the source chain for a deposit (shield)', () => {
    const record: TxRecord<'shield'> = {
      id: '01J', kind: 'shield', executionState: 'pending', stage: 'build-proof',
      stagesCompleted: [], updatedSeq: 0, createdAt: 0, updatedAt: 0,
      meta: { amount: 0n, feeCacheId: '', fromChainId: 31337 },
      artifacts: {},
      walletContext: { evmAddress: undefined, shieldedWalletId: '', sourceChainId: 31337 },
    }
    expect(recordTitle(record)).toMatch(/^Shield from /)
  })

  it('names the 0x recipient for a public unshield (external send / withdraw)', () => {
    const record: TxRecord<'unshield-xchain'> = {
      id: '01J', kind: 'unshield-xchain', executionState: 'pending', stage: 'build-proof',
      stagesCompleted: [], updatedSeq: 0, createdAt: 0, updatedAt: 0,
      meta: {
        amount: 0n,
        feeCacheId: '',
        toChainId: 31338,
        recipient: '0x1234567890abcdef1234567890abcdef12345678',
        broadcasterFeeAmount: 0n,
        broadcasterShieldedAddress: '',
      },
      artifacts: {},
      walletContext: { evmAddress: undefined, shieldedWalletId: '', sourceChainId: 31337 },
    }
    expect(recordTitle(record)).toMatch(/^Sent to 0x/)
  })

  it('reads "Sent to private address" for a private (0zk) transfer', () => {
    const record: TxRecord<'transfer-shielded'> = {
      id: '01J', kind: 'transfer-shielded', executionState: 'pending', stage: 'build-proof',
      stagesCompleted: [], updatedSeq: 0, createdAt: 0, updatedAt: 0,
      meta: {
        amount: 0n,
        feeCacheId: '',
        recipient: '0zkaaaa',
        broadcasterFeeAmount: 0n,
        broadcasterShieldedAddress: '',
      },
      artifacts: {},
      walletContext: { evmAddress: undefined, shieldedWalletId: '', sourceChainId: 31337 },
    }
    expect(recordTitle(record)).toBe('Sent to private address')
  })

  it('reads "Received payment" for an incoming private transfer', () => {
    const record: TxRecord<'transfer-shielded-received'> = {
      id: '01J', kind: 'transfer-shielded-received', executionState: 'completed', stage: 'observed',
      stagesCompleted: ['observed'], updatedSeq: 0, createdAt: 0, updatedAt: 0,
      meta: { amount: 0n },
      artifacts: {},
      walletContext: { evmAddress: undefined, shieldedWalletId: '', sourceChainId: 31337 },
    }
    expect(recordTitle(record)).toBe('Received payment')
  })

  it('reads the earn-vault copy for yield ops', () => {
    const base = {
      id: '01J', executionState: 'pending' as const, stage: 'build-proof' as const,
      stagesCompleted: [], updatedSeq: 0, createdAt: 0, updatedAt: 0,
      artifacts: {},
      walletContext: { evmAddress: undefined, shieldedWalletId: '', sourceChainId: 31337 },
    }
    const deposit: TxRecord<'yield-deposit'> = {
      ...base, kind: 'yield-deposit',
      meta: { amount: 0n, feeCacheId: '', broadcasterFeeAmount: 0n, broadcasterShieldedAddress: '' },
    }
    const withdraw: TxRecord<'yield-withdraw'> = {
      ...base, kind: 'yield-withdraw',
      meta: { amount: 0n, feeCacheId: '', shares: 0n, broadcasterFeeAmount: 0n, broadcasterShieldedAddress: '' },
    }
    expect(recordTitle(deposit)).toBe('Added to earn vault')
    expect(recordTitle(withdraw)).toBe('Withdrawn from earn vault')
  })
})
