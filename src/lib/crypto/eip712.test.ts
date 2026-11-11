// ABOUTME: Tests for lib/crypto/eip712 — the enrollment message's known-answer digest (from the spec), typed-data shape,
// ABOUTME: verifyingContract derivation, and signature normalization (65-byte, EIP-2098 compact, v∈{0,1,27,28}).

import { describe, it, expect } from 'vitest'
import {
  VERIFYING_CONTRACT,
  VERIFYING_CONTRACT_SOURCE,
  DOMAIN_NAME,
  MESSAGE_PURPOSE,
  MESSAGE_VERSION,
  buildEnrollmentTypedData,
  normalizeSignature,
} from './eip712'
import { hashTypedData, keccak256, toBytes } from 'viem'

describe('VERIFYING_CONTRACT', () => {
  it('is the first 20 bytes of keccak256(VERIFYING_CONTRACT_SOURCE)', () => {
    // Re-derive locally — verifies the address isn't a typo and our derivation is documented.
    const hash = keccak256(toBytes(VERIFYING_CONTRACT_SOURCE))
    const expected = `0x${hash.slice(2, 42)}`
    expect(VERIFYING_CONTRACT).toBe(expected)
  })

  it('is the v2 testnet identifier (governance fork from v1)', () => {
    expect(VERIFYING_CONTRACT_SOURCE).toBe('armada-enrollment:testnet:v2')
  })
})

describe('buildEnrollmentTypedData', () => {
  it('produces the four governance-frozen fields verbatim', () => {
    const td = buildEnrollmentTypedData(0n)
    expect(td.domain.name).toBe(DOMAIN_NAME)
    expect(td.domain.name).toBe('Armada Protocol')
    expect(td.domain.verifyingContract).toBe(VERIFYING_CONTRACT)
    expect(td.message.purpose).toBe(MESSAGE_PURPOSE)
    expect(td.message.purpose).toBe('Generate privacy keys (NOT a transaction)')
    expect(td.message.version).toBe(MESSAGE_VERSION)
    expect(td.message.version).toBe('2')
  })

  it('omits chainId from the domain (per spec — chain-agnostic identity)', () => {
    const td = buildEnrollmentTypedData(0n)
    expect(td.domain).not.toHaveProperty('chainId')
    expect(td.types.EIP712Domain.find(f => f.name === 'chainId')).toBeUndefined()
  })

  it('encodes account as a uint256 decimal string and defaults to 0', () => {
    const td = buildEnrollmentTypedData()
    expect(td.message.account).toBe('0')
    expect(td.types.Enrollment.find(f => f.name === 'account')?.type).toBe('uint256')
  })

  it('preserves the account value through the message', () => {
    const td = buildEnrollmentTypedData(7n)
    expect(td.message.account).toBe('7')
  })

  it.each([
    [0n, '0xe5fe0789f71bbd2908389b2b4112c0a7e0270a682870c7e637131f9a25ec115b'],
    [7n, '0xc46c5c4d826977d7463730bb4a200ee67fd2be6b23f69c2c744a4e7fa9199341'],
  ])('hashes to the spec\'s known-answer digest (account %s)', (account, digest) => {
    // WHY: this digest is what the wallet signs, and the signature IS the user's identity (v2 re-derives it on every
    // sign-in, so it must be reproducible). Reordering the Enrollment fields, changing a type (e.g. account → uint64),
    // the domain fields or primaryType would give every user a new wallet while a shape check still passed. The
    // digests were computed independently (ethers TypedDataEncoder) from a typed-data object written straight from
    // specs/TX_SIGNING.md + TX_SIGNING_V2_AMENDMENT.md.
    const td = buildEnrollmentTypedData(account)
    expect(hashTypedData({ domain: td.domain, types: { Enrollment: [...td.types.Enrollment] }, primaryType: td.primaryType, message: { ...td.message, account: BigInt(td.message.account) } })).toBe(digest)
    // …and the domain type the app sends lists exactly the domain's fields, in order.
    expect(td.types.EIP712Domain).toEqual([{ name: 'name', type: 'string' }, { name: 'verifyingContract', type: 'address' }])
  })

  it('does not include the v1 issuedAt field anymore', () => {
    const td = buildEnrollmentTypedData(0n)
    expect(td.message).not.toHaveProperty('issuedAt')
    expect(td.types.Enrollment.find(f => f.name === 'issuedAt')).toBeUndefined()
  })

  it('rejects negative account values', () => {
    expect(() => buildEnrollmentTypedData(-1n)).toThrow()
  })
})

describe('normalizeSignature', () => {
  // Build a deterministic 65-byte signature; values aren't from a real signer but exercise the
  // byte-ordering surface that matters.
  function makeBytes(rPad: number, sPad: number, v: number): Uint8Array {
    const out = new Uint8Array(65)
    for (let i = 0; i < 32; i++) out[i] = rPad
    for (let i = 32; i < 64; i++) out[i] = sPad
    out[64] = v
    return out
  }

  it('passes through v=27/28 unchanged', () => {
    const sig = makeBytes(0xab, 0xcd, 28)
    const norm = normalizeSignature(sig)
    expect(norm.length).toBe(65)
    expect(norm[64]).toBe(28)
  })

  it('promotes v=0 to 27', () => {
    const sig = makeBytes(0xab, 0xcd, 0)
    expect(normalizeSignature(sig)[64]).toBe(27)
  })

  it('promotes v=1 to 28', () => {
    const sig = makeBytes(0xab, 0xcd, 1)
    expect(normalizeSignature(sig)[64]).toBe(28)
  })

  it('rejects unexpected v values', () => {
    expect(() => normalizeSignature(makeBytes(0, 0, 99))).toThrow()
  })

  it('accepts hex strings (with and without 0x prefix)', () => {
    const sig = makeBytes(0xab, 0xcd, 27)
    const hex = '0x' + Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')
    expect(normalizeSignature(hex)).toEqual(sig)
    expect(normalizeSignature(hex.slice(2))).toEqual(sig)
  })

  it('expands EIP-2098 compact 64-byte signatures', () => {
    // Compact form: r (32) || yParityAndS (32) where the top bit of byte 32 encodes yParity.
    const r = new Uint8Array(32).fill(0x11)
    const s = new Uint8Array(32).fill(0x22)
    // yParity = 1 → set top bit of s[0]
    const yParityAndS = new Uint8Array(s)
    yParityAndS[0] = yParityAndS[0]! | 0x80
    const compact = new Uint8Array(64)
    compact.set(r, 0)
    compact.set(yParityAndS, 32)

    const norm = normalizeSignature(compact)
    expect(norm.length).toBe(65)
    expect(norm.slice(0, 32)).toEqual(r)
    expect(norm.slice(32, 64)).toEqual(s) // top bit cleared
    expect(norm[64]).toBe(28) // yParity=1 → v=28
  })

  it('expands EIP-2098 compact with yParity=0', () => {
    const r = new Uint8Array(32).fill(0x11)
    const s = new Uint8Array(32).fill(0x22) // top bit naturally 0
    const compact = new Uint8Array(64)
    compact.set(r, 0)
    compact.set(s, 32)
    expect(normalizeSignature(compact)[64]).toBe(27)
  })

  it('rejects lengths other than 64 or 65', () => {
    expect(() => normalizeSignature(new Uint8Array(63))).toThrow()
    expect(() => normalizeSignature(new Uint8Array(66))).toThrow()
  })
})
