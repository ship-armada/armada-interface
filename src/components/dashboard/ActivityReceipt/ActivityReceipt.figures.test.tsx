// ABOUTME: Pins the money figures the Activity receipt shows for every tx kind and variant, using the distinct non-zero
// ABOUTME: fee fixture from specs/TX_VALUES.md, row by row (headline, Fees, Total / You received / net).

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityReceipt } from './ActivityReceipt'
import type { TxKind, TxRecord } from '@/lib/tx/types'
import { A, C, C_ACTUAL, F, FOLD, G, P, txRecord } from '@/test/fixtures/txValues'
import { headlineAmount, summaryRow } from '@/test/summaryRows'

const RELAYER_0ZK = '0zk' + 'b'.repeat(64)
const RECIPIENT_0ZK = '0zk' + 'c'.repeat(64)
const RECIPIENT_EVM = '0x1234567890abcdef1234567890abcdef12345678'

function showReceipt<K extends TxKind>(kind: K, meta: Record<string, unknown>, overrides: Partial<TxRecord> = {}) {
  render(<ActivityReceipt record={txRecord(kind, meta, overrides)} open onClose={vi.fn()} />)
}

const spendMeta = (fee: bigint, extra: Record<string, unknown> = {}) => ({
  amount: A, broadcasterFeeAmount: fee, broadcasterFeePerProof: F, broadcasterShieldedAddress: RELAYER_0ZK, ...extra,
})

describe('<ActivityReceipt> figures (spec fixture)', () => {
  describe('shield', () => {
    it('gasless: amount, relayer + protocol fee, and the net received (SH-1…SH-3)', () => {
      showReceipt('shield', { amount: A, fromChainId: 31337, useGasless: true, feeAmount: F, protocolFee: P })
      expect(headlineAmount()).toBe('10')
      expect(summaryRow('Fees')).toBe('1.020014 USDC')
      expect(summaryRow('You received')).toBe('8.979986 USDC')
    })

    it('direct: the protocol fee alone (SH-2, SH-3)', () => {
      showReceipt('shield', { amount: A, fromChainId: 31337, protocolFee: P })
      expect(summaryRow('Fees')).toBe('0.020011 USDC')
      expect(summaryRow('You received')).toBe('9.979989 USDC')
    })

    it('a record written before the protocol fee was stored shows no fee', () => {
      showReceipt('shield', { amount: A, fromChainId: 31337 })
      expect(summaryRow('Fees')).toBe('—')
      expect(summaryRow('You received')).toBe('10.00 USDC')
    })
  })

  describe('shield-xchain', () => {
    it('settled: relayer + protocol + the actual CCTP fee (SH-13, SH-14)', () => {
      showReceipt('shield-xchain', {
        amount: A, fromChainId: 31338, useGasless: true, feeAmount: F, protocolFee: P, cctpFee: C_ACTUAL,
      })
      expect(headlineAmount()).toBe('10')
      expect(summaryRow('Fees')).toBe('1.170015 USDC')
      expect(summaryRow('You received')).toBe('8.829985 USDC')
    })

    it('pending, with no CCTP fee stored yet: the fee leaves it out (deviation F3, #73)', () => {
      showReceipt(
        'shield-xchain',
        { amount: A, fromChainId: 31338, useGasless: true, feeAmount: F, protocolFee: P },
        { executionState: 'active' },
      )
      expect(summaryRow('Fees')).toBe('1.020014 USDC')
      expect(summaryRow("You'll receive")).toBe('8.979986 USDC')
    })
  })

  describe('transfer-shielded', () => {
    it.each([
      ['normal', F, '1.000003 USDC', '11.000003 USDC'],
      ['split into 2 proofs', 2n * F, '2.000006 USDC', '12.000006 USDC'],
      ['fold-in', F + FOLD, '1.12346 USDC', '11.12346 USDC'],
    ])('%s: Fees = the relayer fee paid, Total = amount + fee (PS-1…PS-3)', (_variant, fee, fees, total) => {
      showReceipt('transfer-shielded', spendMeta(fee, { recipient: RECIPIENT_0ZK }))
      expect(headlineAmount()).toBe('10')
      expect(summaryRow('Fees')).toBe(fees)
      expect(summaryRow('Total')).toBe(total)
    })
  })

  describe('transfer-shielded-received', () => {
    it('the amount received, and no Fees row (PS-10, PS-11)', () => {
      showReceipt('transfer-shielded-received', { amount: A }, { stage: 'observed' } as Partial<TxRecord>)
      expect(headlineAmount()).toBe('10')
      expect(summaryRow('Total')).toBe('10.00 USDC')
      expect(screen.queryByText('Fees')).toBeNull()
    })
  })

  describe('unshield', () => {
    it('local: Fees = the relayer fee, Total = amount + fee (UN-1…UN-3)', () => {
      showReceipt('unshield-local', spendMeta(F, { recipient: RECIPIENT_EVM }))
      expect(headlineAmount()).toBe('10')
      expect(summaryRow('Fees')).toBe('1.000003 USDC')
      expect(summaryRow('Total')).toBe('11.000003 USDC')
    })

    it('cross-chain: Fees folds in the CCTP estimate, Total = amount + relayer fee (deviation F23, #75)', () => {
      showReceipt('unshield-xchain', spendMeta(F, { recipient: RECIPIENT_EVM, toChainId: 31338, cctpFee: C }), {
        stage: 'client-mint-confirmed',
      } as Partial<TxRecord>)
      expect(summaryRow('Fees')).toBe('1.30001 USDC')
      expect(summaryRow('Total')).toBe('11.000003 USDC')
    })

    it('cross-chain, written before the CCTP fee was stored: the relayer fee alone', () => {
      showReceipt('unshield-xchain', spendMeta(F, { recipient: RECIPIENT_EVM, toChainId: 31338 }), {
        stage: 'client-mint-confirmed',
      } as Partial<TxRecord>)
      expect(summaryRow('Fees')).toBe('1.000003 USDC')
      expect(summaryRow('Total')).toBe('11.000003 USDC')
    })
  })

  describe('yield', () => {
    it.each([
      ['normal', F, '1.000003 USDC', '11.000003 USDC'],
      ['fold-in', F + FOLD, '1.12346 USDC', '11.12346 USDC'],
    ])('deposit, %s: Fees and the total deducted from the balance (YD-1…YD-3)', (_variant, fee, fees, total) => {
      showReceipt('yield-deposit', spendMeta(fee))
      expect(headlineAmount()).toBe('10')
      expect(summaryRow('Fees')).toBe(fees)
      expect(summaryRow('Total deducted from balance')).toBe(total)
    })

    it('withdraw: the redeemed gross, the fee skimmed from it, and the net received (YD-10…YD-12)', () => {
      showReceipt('yield-withdraw', { amount: G, shares: 9_523_809n, broadcasterFeeAmount: F, broadcasterShieldedAddress: RELAYER_0ZK })
      expect(headlineAmount()).toBe('9.999999')
      expect(summaryRow('Fees')).toBe('1.000003 USDC')
      expect(summaryRow('Received into private balance')).toBe('8.999996 USDC')
    })
  })

  describe('consolidate', () => {
    it('the fee is the headline, the Fees and the Total (MG-1, MG-2)', () => {
      showReceipt('consolidate', {
        amount: 0n, tokenAddress: '0xusdc', tokenSymbol: 'USDC', broadcasterFeeAmount: 2n * F,
        broadcasterFeePerProof: F, broadcasterShieldedAddress: RELAYER_0ZK, notesMerged: 11, notesCreated: 2,
      })
      expect(headlineAmount()).toBe('2.000006')
      expect(summaryRow('Fees')).toBe('2.000006 USDC')
      expect(summaryRow('Total')).toBe('2.000006 USDC')
    })
  })
})
