// ABOUTME: Tests for useShieldedSyncPoll's cadence decision — fast while a tx is in flight, fast catch-up
// ABOUTME: right after a tx, steady state otherwise, and off when disabled.

import { describe, it, expect } from 'vitest'
import { nextSyncInterval } from './useShieldedSyncPoll'

const NOW = 1_000_000_000_000

describe('nextSyncInterval', () => {
  it('stops polling when disabled (locked / hidden tab)', () => {
    expect(nextSyncInterval(false, NOW, NOW, true)).toBe(false)
  })

  it('uses the in-flight cadence while a tx is running (even before it completes)', () => {
    // No recently-completed tx, but one is in flight → still poll fast so the balance catches the note
    // the moment it lands on-chain, independent of the relayer's status reply.
    expect(nextSyncInterval(true, 0, NOW, true)).toBe(5_000)
  })

  it('uses the fast catch-up cadence right after a tx completes', () => {
    expect(nextSyncInterval(true, NOW - 1_000, NOW, false)).toBe(3_000)
  })

  it('stays on the catch-up cadence through the end of the window', () => {
    expect(nextSyncInterval(true, NOW - 59_000, NOW, false)).toBe(3_000)
  })

  it('relaxes to the steady-state cadence once the catch-up window lapses and nothing is in flight', () => {
    expect(nextSyncInterval(true, NOW - 60_000, NOW, false)).toBe(15_000)
  })

  it('is at steady state when no tx is in flight and none has ever completed', () => {
    expect(nextSyncInterval(true, 0, NOW, false)).toBe(15_000)
  })
})
