// ABOUTME: Tests for highFeeLevel — Review's high-fee warning (5D): a caution once every fee the user loses is over 10% of
// ABOUTME: the amount, and a required "I understand" tick over 25%; nothing while a fee or the amount is unknown.

import { describe, it, expect } from 'vitest'
import { highFeeLevel, feePercent } from './highFee'

describe('highFeeLevel', () => {
  it.each<[bigint, bigint, string]>([
    [1_000_000n, 10_000_000n, 'none'], // exactly 10%
    [1_000_001n, 10_000_000n, 'caution'], // just over 10%
    [2_500_000n, 10_000_000n, 'caution'], // exactly 25%
    [2_500_001n, 10_000_000n, 'confirm'], // just over 25%
    [20_000n, 100_000n, 'caution'], // 20%
  ])('fees %s on %s → %s', (fees, amount, level) => {
    expect(highFeeLevel(fees, amount)).toBe(level)
  })

  it('says nothing while the fee or the amount is unknown or zero', () => {
    expect(highFeeLevel(null, 10_000_000n)).toBe('none')
    expect(highFeeLevel(1_000_000n, 0n)).toBe('none')
  })
})

describe('feePercent', () => {
  it('rounds to a whole percent', () => {
    expect(feePercent(2_345_000n, 10_000_000n)).toBe(23)
  })
})
