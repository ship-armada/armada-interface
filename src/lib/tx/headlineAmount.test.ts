// ABOUTME: Tests for headlineAmount — the USDC figure a record's row shows: its amount, or for a consolidation
// ABOUTME: (which moves no value out of the wallet) the fee it paid.

import { describe, it, expect } from 'vitest'
import { headlineAmount } from './headlineAmount'
import type { TxRecord } from './types'

const record = (kind: string, meta: Record<string, unknown>) => ({ kind, meta }) as unknown as TxRecord

describe('headlineAmount', () => {
  it('is the record\'s amount for value-moving kinds', () => {
    expect(headlineAmount(record('transfer-shielded', { amount: 5_000_000n, broadcasterFeeAmount: 20_000n }))).toBe(5_000_000n)
    expect(headlineAmount(record('shield', { amount: 7n }))).toBe(7n)
  })

  it('is the fee for a consolidation (the only USDC that leaves the wallet)', () => {
    expect(headlineAmount(record('consolidate', { amount: 0n, broadcasterFeeAmount: 40_000n }))).toBe(40_000n)
  })
})
