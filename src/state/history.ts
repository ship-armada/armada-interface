// ABOUTME: History-recovery UI state — the scanning / failed status from useHistoryRecovery (Phase 9.3), read by Settings, the Dashboard and the failure banner.
// ABOUTME: historyRecoveryTriggerAtom bumps to re-fire the scan; its `silent` flag decides whether the scan flips the status to `scanning`.

import { atom } from 'jotai'

export type HistoryRecoveryState = 'idle' | 'scanning' | 'failed'

export interface HistoryRecoveryStatus {
  state: HistoryRecoveryState
  /** Last-error message; only meaningful when `state === 'failed'`. */
  error?: string
  /** Total records the most-recent scan recovered (for telemetry / Settings affordances). */
  lastRecordCount?: number
}

/**
 * Live recovery status. Read by Settings' Re-scan button (`scanning`), the Dashboard (the vault's Earned figure waits
 * for `idle`) and `<HistoryRecoveryBanner>` (`failed` → Retry). Written only by `useHistoryRecovery`.
 */
export const historyRecoveryAtom = atom<HistoryRecoveryStatus>({ state: 'idle' })

/** Trigger for a recovery scan. `id` bumps to re-fire; `silent` keeps the status `idle` (no `scanning`, no failure banner). */
export interface HistoryRecoveryTrigger {
  /** Monotonic counter — bumping it re-runs `useHistoryRecovery`'s scan. */
  id: number
  /**
   * When true, the scan runs WITHOUT flipping the status to `scanning` — used for routine incremental
   * delta scans (the incoming-transfer detector fires one after every balance change). User-initiated
   * scans (Settings "Re-scan history", banner Retry, Clear history) bump with `silent: false`, so the
   * status reads `scanning` (Settings' Re-scan button and the Dashboard's Earned figure wait on it). The
   * initial recovery on unlock always reads `scanning` regardless of this flag.
   */
  silent: boolean
}

/**
 * Bumped to re-run the recovery scan. `useHistoryRecovery` includes this in its effect deps so a
 * bump re-fires the scan; its `silent` flag decides whether it reads `scanning` and surfaces a failure.
 * User-initiated re-scans (Settings, Retry, Clear history) also wipe the checkpoint so the SDK
 * walks from the hub deploy block.
 */
export const historyRecoveryTriggerAtom = atom<HistoryRecoveryTrigger>({ id: 0, silent: false })
