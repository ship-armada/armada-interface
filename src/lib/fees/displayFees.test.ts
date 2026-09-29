import { describe, expect, it } from 'vitest'
import { computeDisplayFees, relayerGasFeeForKind, resolveShieldProtocolFee, shieldFeeIntegrator, shieldProtocolFeeBase, withdrawBelowFee } from './displayFees'
import { computeFeeBreakdown, type FeeSchedule } from '@/lib/relayer'

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

  it('reports no protocol fee for any kind — even given a relayer quote (UN-2: unshields are free per spec)', () => {
    // WHY: the only protocol fee is the pool's shield fee, read on chain (useDisplayFees overrides it for shields).
    // TransactModule charges no unshield fee, and no other kind has one — so a relayer quote must never leak in here.
    for (const kind of ['shield', 'shield-xchain', 'unshield-local', 'unshield-xchain', 'transfer-shielded', 'yield-deposit', 'yield-withdraw', 'consolidate'] as const) {
      expect(computeDisplayFees(kind, 5_000_000n, quote).protocolFee).toBe(0n)
    }
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

describe('shieldFeeIntegrator (F18, #74)', () => {
  const ENV = '0x00000000000000000000000000000000000000e1'
  const ZERO = '0x0000000000000000000000000000000000000000'
  it('the fee is read with the integrator the shield will carry: the configured one only for a direct same-chain shield', () => {
    expect(shieldFeeIntegrator('shield', false, ENV)).toBe(ENV)
    expect(shieldFeeIntegrator('shield', true, ENV)).toBe(ZERO) // gasless shields carry address(0)
    expect(shieldFeeIntegrator('shield-xchain', false, ENV)).toBe(ZERO) // both cross-chain paths do too
    expect(shieldFeeIntegrator('shield-xchain', true, ENV)).toBe(ZERO)
  })
})

describe('resolveShieldProtocolFee (G-4, #74)', () => {
  it('exact: the on-chain read for the base on screen', () => {
    expect(resolveShieldProtocolFee({ feeBase: 5_000_000n, onChain: 25_000n, onChainMatchesLive: true, feeModule: 'available' }))
      .toEqual({ protocolFee: 25_000n, status: 'exact' })
  })

  it('pending: the read for the base on screen hasn\'t landed (or the fee module is still loading) — no fee to show', () => {
    expect(resolveShieldProtocolFee({ feeBase: 5_000_000n, onChain: undefined, onChainMatchesLive: true, feeModule: 'available' }).status).toBe('pending')
    expect(resolveShieldProtocolFee({ feeBase: 5_000_000n, onChain: 25_000n, onChainMatchesLive: false, feeModule: 'available' }).status).toBe('pending')
    expect(resolveShieldProtocolFee({ feeBase: 5_000_000n, onChain: undefined, onChainMatchesLive: true, feeModule: 'loading' }).status).toBe('pending')
  })

  it('estimate: the fee module can\'t be read — the ~50 bps take, marked as an estimate (never 0)', () => {
    expect(resolveShieldProtocolFee({ feeBase: 5_000_000n, onChain: undefined, onChainMatchesLive: true, feeModule: 'unavailable' }))
      .toEqual({ protocolFee: 25_000n, status: 'estimate' })
  })
})
