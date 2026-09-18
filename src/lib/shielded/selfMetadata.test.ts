// ABOUTME: Unit tests for the tx self-metadata codec — round-trip + omit-empty + degrade-on-garbage.

import { describe, it, expect } from 'vitest'
import { encodeTxSelfMetadata, decodeTxSelfMetadata } from './selfMetadata'

describe('encodeTxSelfMetadata / decodeTxSelfMetadata', () => {
  it('round-trips the recoverable fields', () => {
    const blob = encodeTxSelfMetadata({ feeCacheId: 'quote-123' })
    expect(blob).toBeTypeOf('string')
    expect(decodeTxSelfMetadata(blob)).toEqual({ feeCacheId: 'quote-123' })
  })

  it('round-trips the gasless flag', () => {
    const blob = encodeTxSelfMetadata({ feeCacheId: 'q', useGasless: true })
    expect(decodeTxSelfMetadata(blob)).toEqual({ feeCacheId: 'q', useGasless: true })
  })

  it('round-trips the yield APY (bigint bps via a decimal string)', () => {
    const blob = encodeTxSelfMetadata({ yieldApyBps: 450n })
    expect(decodeTxSelfMetadata(blob)).toEqual({ yieldApyBps: 450n })
    // 0% APY is a valid value (Aave reserve paying nothing) — must still round-trip, not be dropped.
    expect(decodeTxSelfMetadata(encodeTxSelfMetadata({ yieldApyBps: 0n }))).toEqual({ yieldApyBps: 0n })
  })

  it('returns undefined when nothing is worth persisting (skips the change memo)', () => {
    // WHY: an empty blob would still write a change memo — calldata gas + a metadata-presence signal
    // for no recovered value. The caller skips prove({ selfMetadata }) when this is undefined.
    expect(encodeTxSelfMetadata({})).toBeUndefined()
    expect(encodeTxSelfMetadata({ feeCacheId: '', useGasless: false })).toBeUndefined()
  })

  it('omits absent flags rather than encoding them false', () => {
    const blob = encodeTxSelfMetadata({ feeCacheId: 'q' })
    expect(decodeTxSelfMetadata(blob)).toEqual({ feeCacheId: 'q' })
  })

  it('degrades to {} on undefined / malformed / wrong-version input', () => {
    expect(decodeTxSelfMetadata(undefined)).toEqual({})
    expect(decodeTxSelfMetadata('')).toEqual({})
    expect(decodeTxSelfMetadata('not json')).toEqual({})
    expect(decodeTxSelfMetadata(JSON.stringify({ v: 2, c: 'q' }))).toEqual({})
  })
})
