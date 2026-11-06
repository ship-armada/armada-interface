// ABOUTME: Tests for balanceRevealMotion's activity first-paint decision — whether the dashboard activity list takes the page-load
// ABOUTME: cascade delay: never when it was already on screen while syncing, yes when it first shows with the balance.

import { describe, it, expect } from 'vitest'
import { activityFirstPaint } from './balanceRevealMotion'

describe('activityFirstPaint', () => {
  it('activity already on screen while syncing never cascades — it stays put when the balance arrives', () => {
    const duringSync = activityFirstPaint(null, 'sync', true)
    expect(duringSync).toBe(false)
    expect(activityFirstPaint(duringSync, 'balance', true)).toBe(false)
  })

  it('activity that first shows with the balance cascades in after the intro', () => {
    const duringSync = activityFirstPaint(null, 'sync', false)
    expect(duringSync).toBeNull()
    expect(activityFirstPaint(duringSync, 'balance', true)).toBe(true)
  })

  it('activity that only appears after the balance has shown enters at once', () => {
    const atBalance = activityFirstPaint(null, 'balance', false)
    expect(atBalance).toBe(false)
    expect(activityFirstPaint(atBalance, 'balance', true)).toBe(false)
  })

  it('nothing is decided before sign-in', () => {
    expect(activityFirstPaint(null, 'sign-in', true)).toBeNull()
  })
})
