// ABOUTME: Guards the same-chain lifecycles' hub-pending stage ("broadcast, awaiting on-chain confirmation", between
// ABOUTME: submit-relayer and hub-confirmed) and the per-stage wait estimates the progress view's timing note uses.

import { describe, it, expect } from 'vitest'
import { lifecycleFor } from './lifecycles'
import type { TxKind } from './types'

// The same-chain kinds all share the build-proof → submit-relayer → hub-pending → hub-confirmed shape.
const KINDS: readonly TxKind[] = [
  'shield', 'shield-xchain', 'unshield-local', 'unshield-xchain', 'transfer-shielded', 'transfer-shielded-received',
  'yield-deposit', 'yield-withdraw', 'consolidate',
]

const SAME_CHAIN_KINDS = [
  'shield',
  'unshield-local',
  'transfer-shielded',
  'yield-deposit',
  'yield-withdraw',
] as const satisfies readonly TxKind[]

describe('same-chain lifecycles — hub-pending confirmation stage', () => {
  it.each(SAME_CHAIN_KINDS)('places hub-pending between submit-relayer and hub-confirmed for %s', (kind) => {
    const { stages } = lifecycleFor(kind)
    const submit = stages.indexOf('submit-relayer')
    const pending = stages.indexOf('hub-pending')
    const confirmed = stages.indexOf('hub-confirmed')
    expect(submit).toBeGreaterThanOrEqual(0)
    expect(pending).toBe(submit + 1)
    expect(confirmed).toBe(pending + 1)
  })

  it.each(SAME_CHAIN_KINDS)('marks hub-pending retryable (post-broadcast, idempotent re-entry) for %s', (kind) => {
    expect(lifecycleFor(kind).retryableStages).toContain('hub-pending')
  })
})

describe('stage estimates — measured on Sepolia (package 7), with headroom for slower devices', () => {
  // The numbers are tuned config (Debug → Tx timings); pin what must hold for any tuning instead.
  it.each(KINDS)('%s: every estimate names one of its stages and is usually-before-slow', (kind) => {
    const lifecycle = lifecycleFor(kind)
    for (const [stage, estimate] of Object.entries(lifecycle.stageEstimates ?? {}) as [string, { usualMs?: number; slowMs: number }][]) {
      expect(lifecycle.stages as readonly string[]).toContain(stage)
      expect(estimate.slowMs).toBeGreaterThan(0)
      if (estimate.usualMs !== undefined) expect(estimate.usualMs).toBeLessThan(estimate.slowMs)
    }
  })

  it('gives a shield\'s build-proof (its wallet prompts — the user\'s own time) no estimate', () => {
    expect((lifecycleFor('shield').stageEstimates as Record<string, unknown> | undefined)?.['build-proof']).toBeUndefined()
    expect((lifecycleFor('shield-xchain').stageEstimates as Record<string, unknown> | undefined)?.['build-proof']).toBeUndefined()
  })
})

