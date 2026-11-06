// ABOUTME: Tests for lib/tx/timings — per-kind, per-stage p50 / p90 durations from completed records' stage-entry stamps,
// ABOUTME: plus the whole tx, and the balance-lag samples; records without stamps (older / recovered) are skipped.

import { describe, it, expect } from 'vitest'
import type { TxRecord } from './types'
import { percentile, stageTimings, latencyTimings, signInTimings } from './timings'
import { txRecord } from '@/test/fixtures/txValues'

function shield(id: string, stamps: Record<string, number>, executionState: TxRecord['executionState'] = 'completed'): TxRecord {
  return txRecord('shield', { amount: 1n, fromChainId: 31337 }, { id, executionState, stageEnteredAt: stamps } as Partial<TxRecord>)
}

describe('percentile', () => {
  it('uses the nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 90)).toBe(5)
    expect(percentile([7], 90)).toBe(7)
  })
})

describe('stageTimings', () => {
  it('measures each stage as the gap to the next stamped stage, and the whole tx, per kind', () => {
    const rows = stageTimings([
      shield('a', { 'build-proof': 0, 'submit-relayer': 1_000, 'hub-confirmed': 5_000 }),
      shield('b', { 'build-proof': 0, 'submit-relayer': 3_000, 'hub-confirmed': 4_000 }),
    ])
    expect(rows).toEqual([
      { kind: 'shield', stage: 'build-proof', samples: 2, p50: 1_000, p90: 3_000 },
      { kind: 'shield', stage: 'submit-relayer', samples: 2, p50: 1_000, p90: 4_000 },
      { kind: 'shield', stage: 'total', samples: 2, p50: 4_000, p90: 5_000 },
    ])
  })

  it('skips records that are not completed or carry no stamps', () => {
    const rows = stageTimings([
      shield('failed', { 'build-proof': 0, 'submit-relayer': 9_000 }, 'failed'),
      txRecord('shield', { amount: 1n, fromChainId: 31337 }, { id: 'old' }),
    ])
    expect(rows).toEqual([])
  })
})

describe('latencyTimings', () => {
  it('summarises the balance-lag samples per kind', () => {
    expect(
      latencyTimings([
        { kind: 'transfer-shielded', durationMs: 2_000 },
        { kind: 'transfer-shielded', durationMs: 6_000 },
        { kind: 'shield', durationMs: 1_000 },
      ]),
    ).toEqual([
      { kind: 'shield', stage: 'balance update', samples: 1, p50: 1_000, p90: 1_000 },
      { kind: 'transfer-shielded', stage: 'balance update', samples: 2, p50: 2_000, p90: 6_000 },
    ])
  })
})

describe('signInTimings', () => {
  it('summarises sign-in → balance, split into a first sync on this device and a returning one', () => {
    expect(
      signInTimings([
        { cold: true, durationMs: 20_000 },
        { cold: false, durationMs: 1_500 },
        { cold: false, durationMs: 2_500 },
      ]),
    ).toEqual([
      { kind: 'sign-in', stage: 'to balance (first sync)', samples: 1, p50: 20_000, p90: 20_000 },
      { kind: 'sign-in', stage: 'to balance (returning)', samples: 2, p50: 1_500, p90: 2_500 },
    ])
    expect(signInTimings([])).toEqual([])
  })
})
