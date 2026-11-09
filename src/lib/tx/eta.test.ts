// ABOUTME: Tests for stageTimingNote — the progress view's per-stage "usually ~N" / "taking longer than usual" + safe-in-transit
// ABOUTME: note — and estimatedTimeLabel, Review's "Est. time".

import { describe, it, expect } from 'vitest'
import { stageTimingNote, estimatedTimeLabel } from './eta'

describe('stageTimingNote', () => {
  const CONFIRMING = { startedAt: 1_000, usualMs: 15_000, slowMs: 45_000, safeInTransit: false, broadcast: true }

  it('is a quiet "usually" chip while the stage runs normally', () => {
    expect(stageTimingNote(CONFIRMING, 11_000)).toEqual({ kind: 'usual', chip: 'Usually takes ~15 sec' })
  })

  it('is nothing for a stage with only a slow threshold, until it is slow', () => {
    expect(stageTimingNote({ startedAt: 0, slowMs: 20_000, safeInTransit: false, broadcast: false }, 5_000)).toBeNull()
  })

  it('becomes a "taking longer" callout once past the slow threshold — broadcast, so the tab can close', () => {
    expect(stageTimingNote(CONFIRMING, 1_000 + 45_001)).toEqual({
      kind: 'slow',
      title: 'Taking longer than usual',
      body: 'The network may be busy. You can close this tab \u2014 we\u2019ll keep checking.',
    })
  })

  it('reassures that USDC in transit between chains is safe', () => {
    const bridging = { startedAt: 0, usualMs: 30_000, slowMs: 75_000, safeInTransit: true, broadcast: true }
    expect(stageTimingNote(bridging, 80_000)).toEqual({
      kind: 'slow',
      title: 'Taking longer than usual',
      body: 'Your USDC is safe in transit. You can close this tab \u2014 we\u2019ll keep checking.',
    })
  })

  it('asks to keep the tab open when slow before anything is sent (a proof)', () => {
    expect(stageTimingNote({ startedAt: 0, slowMs: 20_000, safeInTransit: false, broadcast: false }, 20_001)).toEqual({
      kind: 'slow',
      title: 'Taking longer than usual',
      body: 'This can take longer on some devices. Keep this tab open until it\u2019s submitted.',
    })
  })
})

describe('estimatedTimeLabel — Review\'s "Est. time" from the stage estimates (+ ~2s per proof), to the nearest 5s', () => {
  it.each([
    ['shield', 1, 'Usually takes ~15 sec'],
    ['shield-xchain', 1, 'Usually takes ~20 sec \u00b7 fast CCTP transfer'],
    ['transfer-shielded', 1, 'Usually takes ~15 sec'],
    ['transfer-shielded', 3, 'Usually takes ~20 sec'],
    ['unshield-local', 1, 'Usually takes ~15 sec'],
    ['unshield-xchain', 1, 'Usually takes ~40 sec \u00b7 fast CCTP transfer'],
    ['yield-deposit', 1, 'Usually takes ~15 sec'],
    ['yield-withdraw', 1, 'Usually takes ~15 sec'],
    ['consolidate', 2, 'Usually takes ~20 sec'],
  ] as const)('%s, %s proof(s) → %s', (kind, proofs, label) => {
    expect(estimatedTimeLabel(kind, proofs)).toBe(label)
  })
})

