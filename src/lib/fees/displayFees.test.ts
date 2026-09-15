import { describe, expect, it } from 'vitest'
import { computeDisplayFees, relayerGasFeeForKind, shieldProtocolFeeBase } from './displayFees'
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

describe('shieldProtocolFeeBase', () => {
  it('carves the relayer fee out first on a gasless shield (the pool charges 50 bps on the remainder)', () => {
    // WHY: the wrapper shields the relayer fee as its OWN note, so the pool takes the shield fee on
    // (amount - relayerFee). Billing it on the full amount double-counts the fee on the relayer note.
    expect(shieldProtocolFeeBase('shield', 5_000_000n, 726_475n, true)).toBe(4_273_525n)
  })

  it('uses the full amount for a direct (non-gasless) shield — no relayer note carved out', () => {
    expect(shieldProtocolFeeBase('shield', 5_000_000n, 0n, false)).toBe(5_000_000n)
  })

  it('uses the full amount for shield-xchain (CCTP carve-out handled separately)', () => {
    expect(shieldProtocolFeeBase('shield-xchain', 5_000_000n, 726_475n, true)).toBe(5_000_000n)
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
