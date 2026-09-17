import { describe, expect, it } from 'vitest'
import { computeDisplayFees, relayerGasFeeForKind, shieldProtocolFeeBase, shieldReceiptFromMeta, withdrawBelowFee } from './displayFees'
import { computeFeeBreakdown, type FeeSchedule } from '@/lib/relayer'
import type { MetaShield, MetaShieldXchain } from '@/lib/tx/types'

const quote: FeeSchedule = {
  cacheId: 'test',
  expiresAt: Date.now() + 60_000,
  chainId: 11155111,
  fees: {
    transfer: '100000',
    unshield: '200000',
    crossContract: '300000',
    crossChainShield: '400000',
    crossChainUnshield: '500000',
  },
}

describe('computeDisplayFees', () => {
  it('returns zero protocolFee for cross-chain shield until useDisplayFees overrides with calculateShieldFee', () => {
    // WHY: `computeDisplayFees` is the pure baseline fed into `useDisplayFees`. For
    // `shield-xchain` it now reports 0 because the CCTP fast-fee was moved to its own channel
    // (`flowBreakdown.cctpFee`) so the fee-breakdown tooltip can label it "CCTP fee" instead of
    // the previous misleading "Relayer fee". The user-visible protocolFee is the on-chain
    // `IArmadaFeeModule.calculateShieldFee` 50 bps, which `useDisplayFees` overlays via a wagmi
    // `useReadContract` for BOTH `shield` and `shield-xchain` (see
    // `apps/armada-interface/src/hooks/useDisplayFees.ts`).
    const amount = 1_000_000_000n // 1000 USDC
    const fees = computeDisplayFees('shield-xchain', amount, quote)
    expect(fees.protocolFee).toBe(0n)
    expect(fees.gasFee).toBe(0n)
    expect(fees.totalFee).toBe(0n)
    expect(fees.feeInclusive).toBe(true)
  })

  it('defaults shield to inclusive with zero CCTP until fee module overrides', () => {
    const fees = computeDisplayFees('shield', 5_000_000n, quote)
    expect(fees.protocolFee).toBe(0n)
    expect(fees.totalFee).toBe(0n)
    expect(fees.feeInclusive).toBe(true)
  })
})

describe('relayerGasFeeForKind', () => {
  it('returns 0 without a quote', () => {
    expect(relayerGasFeeForKind('transfer-shielded', null)).toBe(0n)
  })
})

describe('withdrawBelowFee', () => {
  it('blocks a withdrawal at or below its fee (the redeem proceeds cannot cover the fee)', () => {
    expect(withdrawBelowFee(400_000n, 500_000n)).toBe(true) // amount < fee
    expect(withdrawBelowFee(500_000n, 500_000n)).toBe(true) // amount == fee → nets zero
  })

  it('allows a withdrawal that exceeds its fee', () => {
    expect(withdrawBelowFee(500_001n, 500_000n)).toBe(false)
    expect(withdrawBelowFee(3_000_000n, 500_000n)).toBe(false)
  })

  it('never blocks when there is no fee (wallet-submit / free)', () => {
    // WHY: the withdraw fee comes from the redeemed proceeds, so a zero fee is always coverable —
    // this is the wallet-submit path (user pays ETH gas, no USDC broadcaster fee).
    expect(withdrawBelowFee(0n, 0n)).toBe(false)
    expect(withdrawBelowFee(1n, 0n)).toBe(false)
  })
})

describe('shieldReceiptFromMeta', () => {
  it('nets a gasless same-chain shield by relayer + protocol fee (no cctp leg on MetaShield)', () => {
    const meta = {
      amount: 4_000_000n, feeCacheId: 'x', fromChainId: 31337,
      feeAmount: 742_317n, protocolFee: 16_288n, useGasless: true,
    } as MetaShield
    expect(shieldReceiptFromMeta(meta)).toEqual({
      amount: 4_000_000n, fee: 758_605n, netAmount: 3_241_395n,
    })
  })

  it('nets a shield-xchain by relayer + protocol + CCTP fee', () => {
    const meta = {
      amount: 3_000_000n, feeCacheId: 'x', fromChainId: 84532,
      protocolFee: 14_873n, cctpFee: 25_388n,
    } as MetaShieldXchain
    expect(shieldReceiptFromMeta(meta)).toEqual({
      amount: 3_000_000n, fee: 40_261n, netAmount: 2_959_739n,
    })
  })

  it('reports fee=null (renders "—") when nothing was charged (direct shield, no fees captured)', () => {
    const meta = { amount: 5_000_000n, feeCacheId: 'x', fromChainId: 31337 } as MetaShield
    expect(shieldReceiptFromMeta(meta)).toEqual({ amount: 5_000_000n, fee: null, netAmount: 5_000_000n })
  })

  it('never underflows netAmount if the fees somehow exceed the amount', () => {
    const meta = { amount: 100n, feeCacheId: 'x', fromChainId: 31337, protocolFee: 500n } as MetaShield
    expect(shieldReceiptFromMeta(meta)).toEqual({ amount: 100n, fee: 500n, netAmount: 100n })
  })
})

describe('shieldProtocolFeeBase', () => {
  it('carves the relayer fee out first on a gasless shield (the pool charges 50 bps on the remainder)', () => {
    // WHY: the wrapper shields the relayer fee as its OWN note, so the pool takes the shield fee on
    // (amount - relayerFee). Billing it on the full amount double-counts the fee on the relayer note.
    expect(shieldProtocolFeeBase('shield', 5_000_000n, 726_475n, true)).toBe(4_273_525n)
  })

  it('uses the full amount for a direct (non-gasless) shield — no relayer note carved out', () => {
    expect(shieldProtocolFeeBase('shield', 5_000_000n, 0n, false)).toBe(5_000_000n)
  })

  it('carves out the CCTP fee AND the relayer fee for shield-xchain (B2)', () => {
    // WHY: the CCTP mint deducts its fee before the deposit reaches the pool, then the gasless wrapper
    // carves the relayer fee as its own note — so the pool takes 50 bps on (amount - cctpFee - relayerFee).
    expect(shieldProtocolFeeBase('shield-xchain', 3_000_000n, 0n, true, 25_000n)).toBe(2_975_000n)
    expect(shieldProtocolFeeBase('shield-xchain', 3_000_000n, 10_000n, true, 25_000n)).toBe(2_965_000n)
  })

  it('never underflows shield-xchain if the carve-outs exceed the amount', () => {
    expect(shieldProtocolFeeBase('shield-xchain', 100n, 200n, true, 50n)).toBe(100n)
  })

  it('never underflows if the relayer fee exceeds the amount', () => {
    expect(shieldProtocolFeeBase('shield', 100n, 200n, true)).toBe(100n)
  })

  it('the reduced base makes "you receive" match the on-chain shielded note (the 4.252158 case)', () => {
    // The real tx: shield 5 USDC gasless, relayer fee 0.726475, 50 bps shield fee. The base fix makes
    // the estimate land on the note that actually landed on chain (4.252158), not the old 4.248525
    // that double-counted the shield fee on the relayer's fee note.
    const base = shieldProtocolFeeBase('shield', 5_000_000n, 726_475n, true)
    const protocolFee = (base * 50n) / 10_000n // 50 bps, matching the fee module fallback
    expect(protocolFee).toBe(21_367n)
    const { recipientReceives } = computeFeeBreakdown('shield', 5_000_000n, 726_475n, 5_000_000n, {
      protocolFee,
      gasless: true,
    })
    expect(recipientReceives).toBe(4_252_158n)
  })
})
