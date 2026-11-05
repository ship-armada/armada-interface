// ABOUTME: Guards the same-chain lifecycles' hub-pending stage ("broadcast, awaiting on-chain confirmation", between
// ABOUTME: submit-relayer and hub-confirmed) and the per-stage wait estimates the progress view's timing note uses.

import { describe, it, expect } from 'vitest'
import { lifecycleFor } from './lifecycles'
import type { TxKind } from './types'

// The same-chain kinds all share the build-proof → submit-relayer → hub-pending → hub-confirmed shape.
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
  it.each<[TxKind, string, number | undefined, number]>([
    ['transfer-shielded', 'build-proof', undefined, 20_000],
    ['unshield-local', 'build-proof', undefined, 20_000],
    ['unshield-xchain', 'build-proof', undefined, 20_000],
    ['yield-deposit', 'build-proof', undefined, 20_000],
    ['yield-withdraw', 'build-proof', undefined, 20_000],
    ['consolidate', 'build-proof', undefined, 20_000],
    ['shield', 'hub-pending', 15_000, 45_000],
    ['unshield-local', 'hub-pending', 15_000, 45_000],
    ['transfer-shielded', 'hub-pending', 15_000, 45_000],
    ['yield-deposit', 'hub-pending', 15_000, 45_000],
    ['yield-withdraw', 'hub-pending', 15_000, 45_000],
    ['consolidate', 'hub-pending', 15_000, 45_000],
    ['unshield-xchain', 'submit-relayer', 10_000, 40_000],
    ['shield-xchain', 'iris-attestation-pending', 20_000, 60_000],
    ['unshield-xchain', 'iris-attestation-pending', 30_000, 75_000],
  ])('%s / %s: usually %s, slow after %s', (kind, stage, usualMs, slowMs) => {
    const estimates = lifecycleFor(kind).stageEstimates as Partial<Record<string, { usualMs?: number; slowMs: number }>>
    expect(estimates[stage]).toEqual(usualMs === undefined ? { slowMs } : { usualMs, slowMs })
  })

  it('gives a shield\'s build-proof (its wallet prompts — the user\'s own time) no estimate', () => {
    expect((lifecycleFor('shield').stageEstimates as Record<string, unknown> | undefined)?.['build-proof']).toBeUndefined()
    expect((lifecycleFor('shield-xchain').stageEstimates as Record<string, unknown> | undefined)?.['build-proof']).toBeUndefined()
  })
})

