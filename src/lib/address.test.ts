// ABOUTME: Tests for lib/address — EVM / shielded validators (mixed-case + whitespace tolerance) and the
// ABOUTME: counterparty display split (fixed prefix + the meaningful head/tail a user verifies).

import { describe, it, expect } from 'vitest'
import {
  isEvmAddress,
  validateEvmAddress,
  isShieldedAddress,
  validateShieldedAddressStrict,
  splitAddressForDisplay,
  shortAddress,
  extractAddress,
} from './address'

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

describe('splitAddressForDisplay', () => {
  // WHY: "0zk1" is fixed (bech32m hrp + separator), so the old 6+4 truncation ("0zk1qy...ab12") left the
  // user ~5 meaningful characters to check — cheap for a lookalike address to match. Skip the fixed part
  // and show 8 + 6 meaningful characters.
  const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

  it('splits a 0zk address into the fixed prefix, 8 head and 6 tail characters', () => {
    expect(splitAddressForDisplay(ZK)).toEqual({ prefix: '0zk1', head: 'qyk9nn28', tail: '9wnce0' })
  })

  it('splits a 0x address into "0x", 4 head and 4 tail characters', () => {
    expect(splitAddressForDisplay('0x1234567890abcdef1234567890abcdef12345678')).toEqual({
      prefix: '0x',
      head: '1234',
      tail: '5678',
    })
  })

  it('treats a bare "0zk" prefix (no separator) as the fixed part', () => {
    expect(splitAddressForDisplay('0zk' + 'a'.repeat(40))).toEqual({ prefix: '0zk', head: 'aaaaaaaa', tail: 'aaaaaa' })
  })

  it('returns null for strings too short to shorten or of unknown shape', () => {
    expect(splitAddressForDisplay('0x1234')).toBeNull()
    expect(splitAddressForDisplay('hello world, not an address at all')).toBeNull()
  })
})

describe('shortAddress', () => {
  it('joins the split parts with "..."', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678')
    expect(shortAddress('0zk' + 'b'.repeat(40))).toBe('0zkbbbbbbbb...bbbbbb')
  })

  it('returns the input unchanged when it cannot be split', () => {
    expect(shortAddress('0x1234')).toBe('0x1234')
  })
})

describe('extractAddress', () => {
  const EVM = '0x1234567890abcdef1234567890abcdef12345678'
  const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

  it('returns a bare address trimmed', () => {
    expect(extractAddress(`  ${EVM}\n`)).toBe(EVM)
    expect(extractAddress(ZK)).toBe(ZK)
  })

  it('pulls the one address out of surrounding text or a payment URI', () => {
    expect(extractAddress(`Hey, pay me at ${EVM} thanks!`)).toBe(EVM)
    expect(extractAddress(`ethereum:${EVM}@1?value=1`)).toBe(EVM)
    expect(extractAddress(`My Armada address: ${ZK}.`)).toBe(ZK)
  })

  it('accepts the same address repeated', () => {
    expect(extractAddress(`${EVM} (${EVM})`)).toBe(EVM)
  })

  it('refuses to guess when the text holds two different addresses', () => {
    expect(extractAddress(`${EVM} or 0x2222222222222222222222222222222222222222`)).toBeNull()
  })

  it('returns null when there is no valid address (including a bad EIP-55 checksum)', () => {
    expect(extractAddress('no address here')).toBeNull()
    expect(extractAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD')).toBeNull()
  })
})
