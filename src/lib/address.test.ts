// ABOUTME: Tests for lib/address validators — positive + negative cases for EVM and shielded address shapes.
// ABOUTME: Mixed-case + whitespace tolerance is exercised explicitly since users frequently paste with trailing spaces.

import { describe, it, expect } from 'vitest'
import { isEvmAddress, validateEvmAddress, isShieldedAddress, validateShieldedAddressStrict } from './address'

// Canonical EIP-55 checksummed address from the spec's test vectors.
const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

describe('isEvmAddress', () => {
  it('accepts a valid lowercase address (no checksum to verify)', () => {
    expect(isEvmAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true)
  })
  it('accepts a correctly EIP-55-checksummed mixed-case address', () => {
    expect(isEvmAddress(CHECKSUMMED)).toBe(true)
  })
  it('rejects a mixed-case address with a bad EIP-55 checksum (typo guard)', () => {
    // WHY (P1 hygiene): a pure shape check waves through a transposed/mistyped character. The
    // checksum catches it. Flip one cased char of the canonical address → checksum no longer matches.
    expect(isEvmAddress('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false)
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

describe('validateEvmAddress', () => {
  it('categorises a shape failure', () => {
    expect(validateEvmAddress('0x1234')).toEqual({ valid: false, error: 'shape' })
  })
  it('categorises a checksum failure distinctly from a shape failure', () => {
    expect(validateEvmAddress('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toEqual({
      valid: false,
      error: 'checksum',
    })
  })
  it('accepts a correctly checksummed address with no error', () => {
    expect(validateEvmAddress(CHECKSUMMED)).toEqual({ valid: true })
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

describe('validateShieldedAddressStrict', () => {
  it('rejects obviously-malformed input via the fast pre-filter (no SDK load)', async () => {
    // WHY: the shape pre-filter short-circuits before the dynamic SDK import, so junk input is
    // rejected cheaply (and the test doesn't drag the jsdom-hostile SDK into the run).
    expect(await validateShieldedAddressStrict('not-an-address')).toBe(false)
    expect(await validateShieldedAddressStrict('0x1234')).toBe(false)
    expect(await validateShieldedAddressStrict('0zkshort')).toBe(false)
  })

  it('accepts a real 0zk address and rejects it with one character changed (bech32m checksum)', async () => {
    // WHY: the shape regex alone waves a transposed character through; the SDK's decodeAddress (loaded from
    // the @armada/sdk root, #92) must catch it so funds aren't sent to an address nobody owns.
    // A real address: the SDK's deriveKeyset(32 bytes of 0x07).shieldedAddress, derived once under Node
    // (jsdom's Uint8Array isn't accepted by Node's WebCrypto, so it can't be derived in this environment).
    const shieldedAddress =
      '0zk1qyv0wq8h0egurp4tegvl3w55zuwy6zllsgtxdujc7se7mw6krd0l9rv7j6fe3z53l760kqqv4umlxypp7luwl349wf0ep06cln5gq0c4vexy99hk49zqyuu5qza'
    expect(await validateShieldedAddressStrict(shieldedAddress)).toBe(true)

    const i = shieldedAddress.length - 10
    const corrupted = shieldedAddress.slice(0, i) + (shieldedAddress[i] === 'q' ? 'p' : 'q') + shieldedAddress.slice(i + 1)
    expect(isShieldedAddress(corrupted)).toBe(true) // still passes the shape pre-filter…
    expect(await validateShieldedAddressStrict(corrupted)).toBe(false) // …but not the checksum
  })
})
