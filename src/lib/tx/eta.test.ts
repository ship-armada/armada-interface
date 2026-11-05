// ABOUTME: Tests for stepperEta (T-L4) — elapsed timer + overdue ("taking longer than usual") past p90 — and stageTimingNote,
// ABOUTME: the progress view's per-stage "usually ~N" / "taking longer than usual" + safe-in-transit note.

import { describe, it, expect } from 'vitest'
import { stepperEta, formatElapsed, stageTimingNote } from './eta'

const EST = { p50: 30_000, p90: 120_000 }

function rec(executionState: string, createdAt: number) {
  return { executionState: executionState as never, createdAt }
}

describe('stepperEta (T-L4)', () => {
  it('shows the p50 hint + elapsed while in flight and within p90', () => {
    const r = stepperEta(rec('waiting', 0), EST, 12_000)
    expect(r.overdue).toBe(false)
    expect(r.label).toMatch(/Usually takes/i)
    expect(r.label).toMatch(/12s elapsed/)
  })

  it('flips to "taking longer than usual" once elapsed passes p90', () => {
    const r = stepperEta(rec('waiting', 0), EST, 130_000) // > 120s p90
    expect(r.overdue).toBe(true)
    expect(r.label).toMatch(/Taking longer than usual/i)
  })

  it('returns an empty label for terminal records (no live ETA)', () => {
    expect(stepperEta(rec('completed', 0), EST, 999_000)).toEqual({ label: '', overdue: false })
    expect(stepperEta(rec('failed', 0), EST, 999_000)).toEqual({ label: '', overdue: false })
  })

  it('never marks overdue when p90 is 0 (kinds with no meaningful duration)', () => {
    const r = stepperEta(rec('active', 0), { p50: 0, p90: 0 }, 999_000)
    expect(r.overdue).toBe(false)
    expect(r.label).toMatch(/elapsed/)
  })

  it('formatElapsed renders s / m / h m', () => {
    expect(formatElapsed(12_000)).toBe('12s')
    expect(formatElapsed(120_000)).toBe('2m')
    expect(formatElapsed(3_900_000)).toBe('1h 5m')
  })
})

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
