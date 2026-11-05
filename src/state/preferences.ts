// ABOUTME: User preferences atom — auto-lock timer, technical-details default, tx-notice style. Persisted to localStorage.
// ABOUTME: Small enough for localStorage; if we add device-scoped or sensitive prefs later, migrate to IDB via lib/cache.

import { atomWithStorage } from 'jotai/utils'

export type AutoLockMinutes = 5 | 15 | 30

/**
 * How tx outcome notices are shown — `toast` (a floating toast per tx, bottom-right) or `pill` (the header's pending
 * pill announces it). A tx in flight is always shown by the pill.
 */
export type TxNoticeStyle = 'toast' | 'pill'

export interface PreferencesValue {
  /** Idle minutes before the shielded wallet auto-locks. */
  autoLockMinutes: AutoLockMinutes
  /** When true, TxLifecycleStepper opens its technical-details disclosure by default. */
  showTechnicalDetailsByDefault: boolean
  /** Tx outcome notice style. Optional: preferences saved before it existed lack it (read as `toast`). */
  txNoticeStyle?: TxNoticeStyle
}

export const DEFAULT_PREFERENCES: PreferencesValue = {
  autoLockMinutes: 15,
  showTechnicalDetailsByDefault: false,
  txNoticeStyle: 'toast',
}

/**
 * localStorage key the preferences atom reads + writes under. Exported so tests (or any code
 * that needs to clear/inspect the persisted value) can reference it instead of hardcoding the
 * literal string. Changing this key in code WITHOUT a migration silently resets every existing
 * user's preferences to DEFAULT_PREFERENCES — treat it as a stable identifier.
 */
export const PREFERENCES_STORAGE_KEY = 'armada-interface.preferences'

/**
 * Persisted user preferences. Reads/writes localStorage via jotai/utils — no manual sync needed.
 */
export const preferencesAtom = atomWithStorage<PreferencesValue>(
  PREFERENCES_STORAGE_KEY,
  DEFAULT_PREFERENCES,
)
