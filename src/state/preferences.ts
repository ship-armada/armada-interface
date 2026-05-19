// ABOUTME: User preferences atom — auto-lock timer + technical-details default. Persisted to localStorage via jotai/utils.
// ABOUTME: Small enough for localStorage; if we add device-scoped or sensitive prefs later, migrate to IDB via lib/cache.

import { atomWithStorage } from 'jotai/utils'

export type AutoLockMinutes = 5 | 15 | 30

export interface PreferencesValue {
  /** Idle minutes before the shielded wallet auto-locks. */
  autoLockMinutes: AutoLockMinutes
  /** When true, TxLifecycleStepper opens its technical-details disclosure by default. */
  showTechnicalDetailsByDefault: boolean
}

export const DEFAULT_PREFERENCES: PreferencesValue = {
  autoLockMinutes: 15,
  showTechnicalDetailsByDefault: false,
}

/**
 * Persisted user preferences. Reads/writes localStorage under `armada-interface.preferences`.
 * Reading the atom is free — jotai/utils handles the storage round-trip.
 */
export const preferencesAtom = atomWithStorage<PreferencesValue>(
  'armada-interface.preferences',
  DEFAULT_PREFERENCES,
)
