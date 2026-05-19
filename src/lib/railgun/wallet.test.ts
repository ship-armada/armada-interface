// ABOUTME: Tests for lib/railgun/wallet — exercise generateMnemonic (real ethers BIP39); confirm stubs throw as documented.
// ABOUTME: We don't assert against the official wordlist here — the underlying ethers Mnemonic does that — but we check shape.

import { describe, it, expect } from 'vitest'
import { generateMnemonic, createWallet, unlockWallet, resetWallet } from './wallet'

describe('generateMnemonic', () => {
  it('returns a 12-word space-separated phrase', () => {
    const m = generateMnemonic()
    expect(m.split(' ').length).toBe(12)
  })

  it('words are non-empty lowercase tokens', () => {
    const m = generateMnemonic()
    for (const w of m.split(' ')) {
      expect(w.length).toBeGreaterThan(0)
      expect(w).toBe(w.toLowerCase())
    }
  })

  it('subsequent calls produce different phrases', () => {
    const a = generateMnemonic()
    const b = generateMnemonic()
    expect(a).not.toBe(b)
  })
})

describe('stubs throw with stable error strings', () => {
  it('createWallet throws', async () => {
    await expect(createWallet('words', 'pass')).rejects.toThrow(/not implemented/)
  })
  it('unlockWallet throws', async () => {
    await expect(unlockWallet('id', 'pass')).rejects.toThrow(/not implemented/)
  })
  it('resetWallet throws', async () => {
    await expect(resetWallet('id')).rejects.toThrow(/not implemented/)
  })
})
