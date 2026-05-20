// ABOUTME: Boundary test vectors from specs/TX_SIGNING.md §"Bytes to Field Element Mapping".
// ABOUTME: Exercises the bytes→big-endian-BigInt half of the conversion; the % r / % l reduction lands in Phase 2.

import { describe, it, expect } from 'vitest'
import { bytesToBigIntBE } from './kdf'

/**
 * BN254 scalar field order from the spec (line 327-329):
 *   r = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
 */
const R = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n

function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i * 2, 2), 16)
  }
  return out
}

/**
 * The 6 boundary vectors from the spec. Each verifies:
 *  (a) the byte-array → BigInt step is big-endian (`bytesToBigIntBE`)
 *  (b) the eventual % r reduction produces the spec's "Scalar" output
 *
 * Phase 1 doesn't yet do field reduction (the SDK does it inside Railgun). Phase 2 will add an
 * explicit `reduce(bytes, modulus)` against Andrew's confirmed modulus and we'll lock vectors
 * against r and/or l at that point.
 */
const vectors: ReadonlyArray<{
  name: string
  input: string
  preReduction?: bigint // optional — derived from input
  scalarModR: bigint
}> = [
  {
    name: 'Vector 1: All zeros (identity element)',
    input: '0x0000000000000000000000000000000000000000000000000000000000000000',
    scalarModR: 0n,
  },
  {
    name: 'Vector 2: r exactly (reduces to zero)',
    input: '0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001',
    scalarModR: 0n,
  },
  {
    name: 'Vector 3: r - 1 (max valid field element, passes through unchanged)',
    input: '0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000',
    scalarModR: 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000n,
  },
  {
    name: 'Vector 4: r + 1 (just above field order, reduces to 1)',
    input: '0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000002',
    scalarModR: 1n,
  },
  {
    name: 'Vector 5: All 0xFF (max 256-bit value, exercises full reduction)',
    input: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    scalarModR: 0x0e0a77c19a07df2f666ea36f7879462e36fc76959f60cd29ac96341c4ffffffan,
  },
  {
    name: 'Vector 6: 2r + 42 (non-trivial reduction to small value)',
    input: '0x60c89ce5c263405370a08b6d0302b0ba5067d090f372e12287c3eb27e000002c',
    scalarModR: 42n,
  },
]

describe('boundary vectors — bytesToBigIntBE half of the bytes→scalar pipeline', () => {
  for (const v of vectors) {
    it(v.name, () => {
      const bytes = hexToBytes(v.input)
      expect(bytes.length).toBe(32)
      const n = bytesToBigIntBE(bytes)
      // The pre-reduction integer reduced mod r MUST match the spec's expected scalar.
      // This is the contract Phase 2's `reduce()` function will inherit.
      expect(n % R).toBe(v.scalarModR)
    })
  }

  it('verifies byte ordering is big-endian (not little-endian)', () => {
    // 0x01 followed by 31 zero bytes should be 2^248, not 1.
    const bytes = new Uint8Array(32)
    bytes[0] = 0x01
    expect(bytesToBigIntBE(bytes)).toBe(1n << 248n)
  })

  it('verifies trailing 0x01 is the least-significant byte', () => {
    const bytes = new Uint8Array(32)
    bytes[31] = 0x01
    expect(bytesToBigIntBE(bytes)).toBe(1n)
  })
})
