// ABOUTME: Unit tests for the deposit/send/earn amount-field sanitizer + active-amount predicate.
// ABOUTME: Covers digit/dot filtering, the 6-decimal cap, leading-zero collapse, forward-typing states, and comma-as-decimal edits.

import { describe, it, expect } from 'vitest'
import { sanitizeAmountInput, sanitizeAmountEdit, hasActiveAmount, formatAmountInputDisplay } from './amountInput'

describe('sanitizeAmountInput', () => {
  it('keeps digits and a single decimal point', () => {
    expect(sanitizeAmountInput('12.34')).toBe('12.34')
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23') // extra dots dropped
    expect(sanitizeAmountInput('$1,500.00')).toBe('1500.00') // strips commas + currency chars
    expect(sanitizeAmountInput('abc4d2')).toBe('42') // non-numeric stripped
  })

  it('preserves the forward-typing states needed for a sub-one amount', () => {
    // Regression: a leading `0`/`.` must survive so `0.5` / `.5` are typeable (previously discarded).
    expect(sanitizeAmountInput('0')).toBe('0')
    expect(sanitizeAmountInput('.')).toBe('.')
    expect(sanitizeAmountInput('0.')).toBe('0.')
    expect(sanitizeAmountInput('0.5')).toBe('0.5')
    expect(sanitizeAmountInput('.5')).toBe('.5')
  })

  it('collapses redundant leading zeros but keeps a lone 0 and 0.', () => {
    expect(sanitizeAmountInput('05')).toBe('5')
    expect(sanitizeAmountInput('007')).toBe('7')
    expect(sanitizeAmountInput('0')).toBe('0')
    expect(sanitizeAmountInput('00')).toBe('0')
    expect(sanitizeAmountInput('0.5')).toBe('0.5')
  })

  it('caps the fractional portion at 6 decimals (USDC precision)', () => {
    expect(sanitizeAmountInput('1.1234567')).toBe('1.123456') // 7th digit dropped
    expect(sanitizeAmountInput('1.123456')).toBe('1.123456') // exactly 6 kept
    expect(sanitizeAmountInput('0.0000001')).toBe('0.000000') // sub-1e-6 clamped, not errored
  })
})

describe('formatAmountInputDisplay', () => {
  it('groups the integer part with thousand separators', () => {
    expect(formatAmountInputDisplay('1000')).toBe('1,000')
    expect(formatAmountInputDisplay('1000000')).toBe('1,000,000')
    expect(formatAmountInputDisplay('1234567.89')).toBe('1,234,567.89')
  })
  it('preserves the decimal suffix verbatim (mid-entry dots survive)', () => {
    expect(formatAmountInputDisplay('1000.')).toBe('1,000.')
    expect(formatAmountInputDisplay('12.5')).toBe('12.5')
  })
  it('adds a leading zero to a bare fraction for display only', () => {
    expect(formatAmountInputDisplay('.5')).toBe('0.5')
    expect(formatAmountInputDisplay('.')).toBe('0.')
  })
  it('returns empty for empty input', () => {
    expect(formatAmountInputDisplay('')).toBe('')
  })
})

describe('hasActiveAmount', () => {
  it('is false for empty / zero / bare-dot states', () => {
    expect(hasActiveAmount('')).toBe(false)
    expect(hasActiveAmount('.')).toBe(false)
    expect(hasActiveAmount('0')).toBe(false)
    expect(hasActiveAmount('0.00')).toBe(false)
  })
  it('is true for a mid-decimal entry or any non-zero amount', () => {
    expect(hasActiveAmount('0.')).toBe(true) // mid-typing
    expect(hasActiveAmount('0.5')).toBe(true)
    expect(hasActiveAmount('10')).toBe(true)
  })
})

describe('sanitizeAmountEdit — comma as a decimal mark', () => {
  // WHY: phones in comma-decimal locales (and desktop users there) type "1,5" for 1.5. The plain
  // sanitizer strips the comma, turning "1,5" into 15 and "0,25" into 25 — a 10–100× wrong amount.
  // The edit is compared with the previous display so our own grouping commas ("1,500") are kept as grouping.

  it('treats a typed comma as the decimal point', () => {
    expect(sanitizeAmountEdit('1,', '1')).toBe('1.')
    expect(sanitizeAmountEdit('0,', '0')).toBe('0.')
    expect(sanitizeAmountEdit(',', '')).toBe('.')
  })

  it('keeps typing forward after the comma became a dot', () => {
    // After "1," the stored value is "1." so the field displays "1."; the next keystroke appends to that.
    expect(sanitizeAmountEdit('1.5', '1.')).toBe('1.5')
    expect(sanitizeAmountEdit('0.25', '0.2')).toBe('0.25')
  })

  it('treats a comma typed after a grouped number as the decimal point', () => {
    // Display shows our grouping "1,000"; typing "," at the end means a decimal.
    expect(sanitizeAmountEdit('1,000,', '1,000')).toBe('1000.')
    // Typing "," in the middle (caret after "1,0") puts the decimal there.
    expect(sanitizeAmountEdit('1,0,00', '1,000')).toBe('10.00')
  })

  it('keeps our own grouping commas as grouping while typing digits', () => {
    expect(sanitizeAmountEdit('1,0000', '1,000')).toBe('10000')
    expect(sanitizeAmountEdit('1,5000', '1,500')).toBe('15000')
    expect(sanitizeAmountEdit('100', '1,000')).toBe('100') // deleting
  })

  it('ignores a typed comma when there is already a decimal point', () => {
    expect(sanitizeAmountEdit('1.5,', '1.5')).toBe('1.5')
  })

  it('reads a pasted value with both separators by its last separator', () => {
    expect(sanitizeAmountEdit('1,500.25', '')).toBe('1500.25')
    expect(sanitizeAmountEdit('1.500,25', '')).toBe('1500.25')
    expect(sanitizeAmountEdit('$1,500.00', '')).toBe('1500.00')
  })

  it('reads a pasted single comma as decimal unless exactly three digits follow (then grouping)', () => {
    expect(sanitizeAmountEdit('1,5', '')).toBe('1.5')
    expect(sanitizeAmountEdit('0,25', '')).toBe('0.25')
    expect(sanitizeAmountEdit('12,345678', '')).toBe('12.345678')
    expect(sanitizeAmountEdit('1,500', '')).toBe('1500') // ambiguous → grouping (matches our own display)
    expect(sanitizeAmountEdit('1,000,000', '')).toBe('1000000')
  })

  it('still caps decimals at six after converting a comma', () => {
    expect(sanitizeAmountEdit('1,1234567', '')).toBe('1.123456')
  })
})
