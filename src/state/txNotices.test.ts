// ABOUTME: Tests for txNoticeStyleAtom — the tx-notice style is a user preference (Settings): toasts by default, also for
// ABOUTME: preferences saved before the setting existed; writing it updates the saved preferences and keeps the rest.

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'jotai'
import { preferencesAtom } from './preferences'
import { txNoticeStyleAtom } from './txNotices'

describe('txNoticeStyleAtom', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reads toasts from preferences saved before the setting existed', () => {
    const store = createStore()
    store.set(preferencesAtom, { autoLockMinutes: 5 })
    expect(store.get(txNoticeStyleAtom)).toBe('toast')
  })

  it('writes the choice into the preferences, keeping the other settings', () => {
    const store = createStore()
    store.set(preferencesAtom, { autoLockMinutes: 30 })
    store.set(txNoticeStyleAtom, 'pill')
    expect(store.get(preferencesAtom)).toEqual({ autoLockMinutes: 30, txNoticeStyle: 'pill' })
    expect(JSON.parse(window.localStorage.getItem('armada-interface.preferences') ?? '{}').txNoticeStyle).toBe('pill')
  })
})
