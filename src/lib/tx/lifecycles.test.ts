// ABOUTME: Guards the same-chain lifecycles' hub-pending stage — the "broadcast, awaiting on-chain
// ABOUTME: confirmation" step that sits between submit-relayer and the terminal hub-confirmed stage.

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
