// ABOUTME: Tests for isInitialSyncGated — the dashboard holds its balance figure (showing the sync card instead) until the SDK
// ABOUTME: balance is known, whatever the scan status; a known balance, even 0, is never gated again.

import { describe, it, expect } from 'vitest'
import { isInitialSyncGated } from './isInitialSyncGated'

describe('isInitialSyncGated', () => {
  it('gates while there is no balance yet — whatever the scan status, until its balance is read (G-11, #80)', () => {
    // WHY: between the scan's `complete` and the SDK balance read landing, the dashboard has no real balance.
    // Ungated, it showed one derived from local history (ignoring fees, received payments and merges) — the UI
    // only ever shows the SDK balance, so it stays on the sync card instead. The gate reads only the balance,
    // so no sync status can lift it early.
    expect(isInitialSyncGated(null)).toBe(true)
  })

  it('does NOT gate once a balance is known, even mid background re-sync', () => {
    // WHY: a balance of 0n is still a KNOWN balance (completed scan, empty wallet). Hiding the balance on every
    // background refresh after that would be a regression.
    expect(isInitialSyncGated(0n)).toBe(false)
    expect(isInitialSyncGated(5_000_000n)).toBe(false)
  })
})
