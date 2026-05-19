// ABOUTME: Tests for lib/address validators — positive + negative cases for EVM and shielded address shapes.
// ABOUTME: Mixed-case + whitespace tolerance is exercised explicitly since users frequently paste with trailing spaces.

import { describe, it, expect } from 'vitest'
import { isEvmAddress, isShieldedAddress } from './address'

describe('isEvmAddress', () => {
  it('accepts a valid lowercase address', () => {
    expect(isEvmAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true)
  })
  it('accepts a valid mixed-case address', () => {
    expect(isEvmAddress('0xAbCdEf1234567890abcDef1234567890abcDef12')).toBe(true)
  })
  it('trims surrounding whitespace', () => {
    expect(isEvmAddress('  0x1234567890abcdef1234567890abcdef12345678  ')).toBe(true)
  })
  it('rejects missing prefix', () => {
    expect(isEvmAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false)
  })
  it('rejects wrong length', () => {
    expect(isEvmAddress('0x1234')).toBe(false)
  })
  it('rejects non-hex chars', () => {
    expect(isEvmAddress('0xZZZZ567890abcdef1234567890abcdef12345678')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isEvmAddress('')).toBe(false)
  })
})

describe('isShieldedAddress', () => {
  it('accepts a 0zk-prefixed alphanumeric string of sufficient length', () => {
    expect(isShieldedAddress('0zk' + 'a'.repeat(40))).toBe(true)
  })
  it('rejects 0zk with too-short payload', () => {
    expect(isShieldedAddress('0zkshort')).toBe(false)
  })
  it('rejects EVM addresses', () => {
    expect(isShieldedAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isShieldedAddress('')).toBe(false)
  })
})
