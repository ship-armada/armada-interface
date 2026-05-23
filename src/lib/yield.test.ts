// ABOUTME: Tests for lib/yield helpers — sharesToUsdc bigint math (zero, normal, large), rateToApy bps→percentage conversion.

import { describe, it, expect } from 'vitest'
import { sharesToUsdc, rateToApy } from './yield'

describe('sharesToUsdc', () => {
  it('returns 0 for zero shares', () => {
    expect(sharesToUsdc(0n, 1_000_000n)).toBe(0n)
  })

  it('returns 0 for zero rate', () => {
    expect(sharesToUsdc(10n ** 18n, 0n)).toBe(0n)
  })

  it('converts 1 full share at 1.0 rate to 1 USDC', () => {
    const oneShare = 10n ** 18n
    const rate = 1_000_000n // 1.0 USDC per share, in 6-decimal USDC numerator over 1e18 share denom
    expect(sharesToUsdc(oneShare, rate)).toBe(1_000_000n)
  })

  it('handles fractional shares', () => {
    const halfShare = 5n * 10n ** 17n // 0.5 of a full share
    const rate = 2_000_000n // 2.0 USDC per share
    expect(sharesToUsdc(halfShare, rate)).toBe(1_000_000n)
  })

  it('handles very large share balances without overflow', () => {
    const huge = 10n ** 30n
    const rate = 1_500_000n
    expect(sharesToUsdc(huge, rate)).toBe(1_500_000n * 10n ** 12n)
  })
})

describe('rateToApy', () => {
  it('returns 0 when bps is 0 (no yield being paid right now)', () => {
    expect(rateToApy(0n)).toBe(0)
  })

  it('converts 500 bps → 5 (a 5% APY)', () => {
    expect(rateToApy(500n)).toBe(5)
  })

  it('converts 450 bps → 4.5 (5% gross × 90% after 10% fee)', () => {
    expect(rateToApy(450n)).toBe(4.5)
  })

  it('handles fractional bps with appropriate decimal precision', () => {
    expect(rateToApy(123n)).toBe(1.23)
    expect(rateToApy(1n)).toBe(0.01)
  })

  it('handles large bps values (above 100% APY in extreme reward markets)', () => {
    expect(rateToApy(50_000n)).toBe(500)
  })
})
