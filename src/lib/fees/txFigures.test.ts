// ABOUTME: Table tests for txFigures, one case per specs/TX_VALUES.md row (IDs in the test names), using the spec's
// ABOUTME: distinct non-zero fee fixture; rows the code doesn't meet yet are todos naming their deviation and issue.

import { describe, it, expect } from 'vitest'
import { txFigures, txFiguresAs, txHeadline } from './txFigures'
import { A, C_ACTUAL, F, FOLD, G, P, txRecord } from '@/test/fixtures/txValues'

const RELAYER_0ZK = '0zk' + 'b'.repeat(64)
const spend = (fee: bigint, extra: Record<string, unknown> = {}) => ({
  amount: A, broadcasterFeeAmount: fee, broadcasterFeePerProof: F, broadcasterShieldedAddress: RELAYER_0ZK, ...extra,
})

describe('txFigures', () => {
  describe('shield (§5)', () => {
    it('SH-1…SH-3 gasless: headline A, Fees F + P, net A − F − P', () => {
      expect(txFigures(txRecord('shield', { amount: A, fromChainId: 31337, useGasless: true, feeAmount: F, protocolFee: P })))
        .toEqual({ model: 'deposit', headline: A, fee: F + P, netAmount: A - F - P })
    })

    it('SH-2, SH-3 direct: Fees P, net A − P', () => {
      expect(txFigures(txRecord('shield', { amount: A, fromChainId: 31337, protocolFee: P })))
        .toEqual({ model: 'deposit', headline: A, fee: P, netAmount: A - P })
    })

    it('a record written before the protocol fee was stored: no fee ("—"), net A', () => {
      expect(txFigures(txRecord('shield', { amount: A, fromChainId: 31337 })))
        .toEqual({ model: 'deposit', headline: A, fee: null, netAmount: A })
    })

    it('the real 4-USDC gasless shield nets by relayer AND protocol fee', () => {
      expect(txFigures(txRecord('shield', { amount: 4_000_000n, fromChainId: 31337, useGasless: true, feeAmount: 742_317n, protocolFee: 16_288n })))
        .toEqual({ model: 'deposit', headline: 4_000_000n, fee: 758_605n, netAmount: 3_241_395n })
    })

    it('never underflows the net if the fees somehow exceed the amount', () => {
      expect(txFigures(txRecord('shield', { amount: 100n, fromChainId: 31337, protocolFee: 500n })))
        .toEqual({ model: 'deposit', headline: 100n, fee: 500n, netAmount: 100n })
    })

    it('SH-13, SH-14 cross-chain, settled: Fees F + P + C\', net A − F − P − C\'', () => {
      expect(txFigures(txRecord('shield-xchain', {
        amount: A, fromChainId: 31338, useGasless: true, feeAmount: F, protocolFee: P, cctpFee: C_ACTUAL,
      }))).toEqual({ model: 'deposit', headline: A, fee: F + P + C_ACTUAL, netAmount: A - F - P - C_ACTUAL })
    })

    it.todo('SH-15 cross-chain, pending: the stored CCTP estimate is in Fees and net, marked est. — F3, #73')
  })

  describe('private send (§6)', () => {
    it.each([
      ['normal', F],
      ['split into 2 proofs', 2n * F],
      ['fold-in', F + FOLD],
    ])('PS-1…PS-3 %s: headline A, Fees = the relayer fee paid, Total A + fee', (_variant, fee) => {
      expect(txFigures(txRecord('transfer-shielded', spend(fee, { recipient: '0zk' + 'c'.repeat(64) }))))
        .toEqual({ model: 'spend', headline: A, fee, totalDeducted: A + fee })
    })

    it.todo('PS-7 a record whose recipient is the wallet\'s own 0zk reads as a merge: amount 0, Fees = Total = fee — F1/F10, #71')

    it('PS-10, PS-11 received: the amount, no fees', () => {
      expect(txFigures(txRecord('transfer-shielded-received', { amount: A }))).toEqual({ model: 'received', headline: A })
    })
  })

  describe('unshield (§7)', () => {
    it('UN-1…UN-3 local: headline A, Fees F, Total A + F', () => {
      expect(txFigures(txRecord('unshield-local', spend(F, { recipient: '0x' + '1'.repeat(40) }))))
        .toEqual({ model: 'spend', headline: A, fee: F, totalDeducted: A + F })
    })

    it('UN-2 a protocol unshield fee, when one was recorded, is part of Fees but not of Total', () => {
      expect(txFigures(txRecord('unshield-local', spend(F, { recipient: '0x' + '1'.repeat(40), protocolFee: P }))))
        .toEqual({ model: 'spend', headline: A, fee: F + P, totalDeducted: A + F })
    })

    it('UN-2, UN-3 cross-chain written before the CCTP fee was stored: Fees F, Total A + F', () => {
      expect(txFigures(txRecord('unshield-xchain', spend(F, { recipient: '0x' + '1'.repeat(40), toChainId: 31338 }))))
        .toEqual({ model: 'spend', headline: A, fee: F, totalDeducted: A + F })
    })

    it.todo('UN-2, UN-2x cross-chain: Fees is the relayer fee; the CCTP fee is its own row, est. until known — F5/F23, #75')
  })

  describe('yield (§7)', () => {
    it.each([
      ['normal', F],
      ['fold-in', F + FOLD],
    ])('YD-1…YD-3 deposit, %s: headline A, Fees = fee, net (total deducted) A + fee', (_variant, fee) => {
      expect(txFigures(txRecord('yield-deposit', spend(fee))))
        .toEqual({ model: 'yield', headline: A, fee, netAmount: A + fee })
    })

    it('YD-10…YD-12 withdraw: headline G, Fees F, net received G − F', () => {
      expect(txFigures(txRecord('yield-withdraw', { ...spend(F), amount: G, shares: 9_523_809n })))
        .toEqual({ model: 'yield', headline: G, fee: F, netAmount: G - F })
    })

    it('a withdraw with no fee nets its full amount', () => {
      expect(txFigures(txRecord('yield-withdraw', { ...spend(0n), amount: G, shares: 9_523_809n })))
        .toEqual({ model: 'yield', headline: G, fee: 0n, netAmount: G })
    })

    it.todo('YD-10 a withdrawal settled without reconciliation shows its typed amount marked est. — F14, #76')
  })

  describe('merge (§7)', () => {
    it('MG-1, MG-2 the fee is the headline and the Fees (a merge moves no value)', () => {
      expect(txFigures(txRecord('consolidate', { ...spend(2n * F), amount: 0n, tokenAddress: '0xusdc' })))
        .toEqual({ model: 'merge', headline: 2n * F, fee: 2n * F })
    })
  })

  describe('non-settled records (G-9)', () => {
    it.todo('a failed / cancelled record whose first on-chain tx never confirmed shows no fees or totals — F25, #79')
  })

  describe('real transactions', () => {
    it('a split send charged 2.78624: Total = amount + the fee actually charged', () => {
      expect(txFigures(txRecord('transfer-shielded', { ...spend(2_786_240n), recipient: '0zk' + 'c'.repeat(64) })))
        .toEqual({ model: 'spend', headline: 10_000_000n, fee: 2_786_240n, totalDeducted: 12_786_240n })
    })

    it('a recovered 3-USDC cross-chain shield nets by protocol AND CCTP fee', () => {
      expect(txFigures(txRecord('shield-xchain', { amount: 3_000_000n, fromChainId: 84532, protocolFee: 14_873n, cctpFee: 25_388n })))
        .toEqual({ model: 'deposit', headline: 3_000_000n, fee: 40_261n, netAmount: 2_959_739n })
    })

    it('a 0.5-USDC vault deposit debits amount + fee', () => {
      expect(txFigures(txRecord('yield-deposit', { ...spend(5_758_001n), amount: 500_000n })))
        .toEqual({ model: 'yield', headline: 500_000n, fee: 5_758_001n, netAmount: 6_258_001n })
    })

    it('a reconciled withdraw (redeemed 6.000019, fee 5.758001) nets 0.242018', () => {
      expect(txFigures(txRecord('yield-withdraw', { ...spend(5_758_001n), amount: 6_000_019n, shares: 1n })))
        .toEqual({ model: 'yield', headline: 6_000_019n, fee: 5_758_001n, netAmount: 242_018n })
    })
  })

  describe('txHeadline (G-8 — the Activity row magnitude)', () => {
    it('is the headline txFigures reports, for every kind', () => {
      const records = [
        txRecord('shield', { amount: A, fromChainId: 31337, feeAmount: F, protocolFee: P }),
        txRecord('transfer-shielded', { ...spend(F), recipient: '0zk' + 'c'.repeat(64) }),
        txRecord('transfer-shielded-received', { amount: A }),
        txRecord('yield-withdraw', { ...spend(F), amount: G, shares: 1n }),
        txRecord('consolidate', { ...spend(2n * F), amount: 0n, tokenAddress: '0xusdc' }),
      ]
      for (const record of records) expect(txHeadline(record)).toBe(txFigures(record).headline)
    })

    it('needs only what the headline is made of, so a list row renders even when fee fields are absent', () => {
      expect(txHeadline(txRecord('unshield-local', { amount: A, recipient: '0x' + '1'.repeat(40) }))).toBe(A)
    })
  })

  describe('txFiguresAs', () => {
    it('returns the figures when the record has the expected shape', () => {
      expect(txFiguresAs(txRecord('consolidate', { ...spend(F), amount: 0n, tokenAddress: '0xusdc' }), 'merge').fee).toBe(F)
    })

    it('throws when a kind is read with another kind\'s shape, rather than misreading its figures', () => {
      expect(() => txFiguresAs(txRecord('transfer-shielded-received', { amount: A }), 'spend'))
        .toThrow('transfer-shielded-received has received figures, not spend')
    })
  })
})
