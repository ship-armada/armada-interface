// ABOUTME: Tests for easedProofProgress — the proof ring's fill: the real SDK checkpoints (0 / 50 / 100% per proof, across
// ABOUTME: all proofs), eased forward at the measured pace but never past the next checkpoint the SDK hasn't reported.

import { describe, it, expect } from 'vitest'
import { easedProofProgress, proofCount, PROOF_MS } from './proofProgress'
import { txRecord } from '@/test/fixtures/txValues'

describe('easedProofProgress', () => {
  it('starts at the real value', () => {
    expect(easedProofProgress({ real: 0, proofs: 1, sinceMs: 0 })).toBe(0)
  })

  it('eases forward at the measured pace (half a proof per half of PROOF_MS)', () => {
    expect(easedProofProgress({ real: 0, proofs: 1, sinceMs: PROOF_MS / 4 })).toBeCloseTo(0.25)
  })

  it('never reaches the next real checkpoint on its own', () => {
    const capped = easedProofProgress({ real: 0, proofs: 1, sinceMs: 60_000 })
    expect(capped).toBeLessThan(0.5)
    expect(capped).toBeGreaterThan(0.4)
  })

  it('spaces checkpoints across several proofs', () => {
    // 2 proofs → a checkpoint every 25%.
    expect(easedProofProgress({ real: 0.5, proofs: 2, sinceMs: 60_000 })).toBeLessThan(0.75)
    expect(easedProofProgress({ real: 0.5, proofs: 2, sinceMs: 60_000 })).toBeGreaterThan(0.7)
  })

  it('holds at 1 once complete', () => {
    expect(easedProofProgress({ real: 1, proofs: 1, sinceMs: 5_000 })).toBe(1)
  })
})

describe('proofCount', () => {
  it('is the total fee over the per-proof fee for a split spend, else 1', () => {
    expect(proofCount(txRecord('transfer-shielded', { amount: 1n, broadcasterFeeAmount: 30n, broadcasterFeePerProof: 10n }))).toBe(3)
    expect(proofCount(txRecord('unshield-local', { amount: 1n, broadcasterFeeAmount: 10n }))).toBe(1)
  })
})
