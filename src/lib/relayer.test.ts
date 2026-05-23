// ABOUTME: Tests for userFeeForKind + cctpMaxFeeForKind — the pure fee-resolution helpers consumed by modals (display) and xchain handlers (CCTP maxFee bound).

import { describe, it, expect } from 'vitest'
import { userFeeForKind, cctpMaxFeeForKind } from './relayer'

const ONE_USDC = 1_000_000n // 6 decimals
const HUNDRED_USDC = 100n * ONE_USDC

describe('userFeeForKind', () => {
  it.each([
    ['shield'],
    ['unshield-local'],
    ['transfer-shielded'],
    ['yield-deposit'],
    ['yield-withdraw'],
  ] as const)('returns 0n for %s (user pays own gas, no USDC deduction)', (kind) => {
    expect(userFeeForKind(kind, HUNDRED_USDC)).toBe(0n)
  })

  it('returns CCTP fast-fee (2 bps of amount) for shield-xchain', () => {
    // 2 bps of 100 USDC = 0.02 USDC = 20_000 raw
    expect(userFeeForKind('shield-xchain', HUNDRED_USDC)).toBe(20_000n)
  })

  it('returns CCTP fast-fee (2 bps of amount) for unshield-xchain', () => {
    expect(userFeeForKind('unshield-xchain', HUNDRED_USDC)).toBe(20_000n)
  })

  it('rounds toward zero for small amounts (bigint integer division)', () => {
    // 2 bps of 1 USDC = 200 raw → no rounding issue here
    expect(userFeeForKind('shield-xchain', ONE_USDC)).toBe(200n)
    // 2 bps of 4999 raw = 9999 / 10000 = 0 (rounds down)
    expect(userFeeForKind('shield-xchain', 4_999n)).toBe(0n)
    // 2 bps of 5000 raw = 10000 / 10000 = 1
    expect(userFeeForKind('shield-xchain', 5_000n)).toBe(1n)
  })

  it('returns 0n when amount is 0n for cctp kinds (no rejection, just nothing to fee)', () => {
    expect(userFeeForKind('shield-xchain', 0n)).toBe(0n)
    expect(userFeeForKind('unshield-xchain', 0n)).toBe(0n)
  })

  it('scales linearly with amount for cctp kinds', () => {
    const big = HUNDRED_USDC * 10_000n // 1M USDC
    expect(userFeeForKind('shield-xchain', big)).toBe(big * 2n / 10_000n)
  })
})

describe('cctpMaxFeeForKind', () => {
  it('is 2× userFeeForKind so Iris feeExecuted has headroom against the on-chain bound', () => {
    // The contract enforces feeExecuted <= maxFee. We pass 2× the realistic estimate so the
    // actual Iris-set fee (1–1.3 bps depending on chain) never trips the bound.
    expect(cctpMaxFeeForKind('shield-xchain', HUNDRED_USDC)).toBe(40_000n)
    expect(cctpMaxFeeForKind('unshield-xchain', HUNDRED_USDC)).toBe(40_000n)
  })

  it('is 0n for non-CCTP kinds (defensive; these kinds never call CCTP)', () => {
    expect(cctpMaxFeeForKind('shield', HUNDRED_USDC)).toBe(0n)
    expect(cctpMaxFeeForKind('unshield-local', HUNDRED_USDC)).toBe(0n)
  })
})
