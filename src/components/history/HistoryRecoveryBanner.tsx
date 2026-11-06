// ABOUTME: Slim banner reading historyRecoveryAtom — a "Couldn't recover activity" notice with Retry when a recovery scan failed; hidden otherwise.
// ABOUTME: Mounted in AppLayout alongside SyncBanner, so a failed recovery is surfaced on any route.

import { useAtomValue, useSetAtom } from 'jotai'
import { historyRecoveryAtom, historyRecoveryTriggerAtom } from '@/state/history'
import styles from './HistoryRecoveryBanner.module.css'

/**
 * Only `failed` renders: a red strip with a Retry CTA that bumps the epoch atom so the scan re-fires.
 * `idle` and `scanning` render nothing.
 *
 * Behaves like SyncBanner: atom reads at the chrome layer are allowed (per
 * components/CLAUDE.md the no-atoms-in-leaves rule applies to design-system primitives, not
 * app-shell pieces).
 */
export function HistoryRecoveryBanner() {
  const recovery = useAtomValue(historyRecoveryAtom)
  const setTrigger = useSetAtom(historyRecoveryTriggerAtom)

  // A running scan shows nothing here: on sign-in the sync gate covers it; a Re-scan / Clear history shows in Settings'
  // "Scanning…" and the refilling Activity list.
  if (recovery.state !== 'failed') return null

  return (
      <div className={`${styles.banner} ${styles.failed}`} role="status" aria-live="polite">
        <span className={styles.message}>
          Couldn't recover activity from chain. {recovery.error ?? ''}
        </span>
        <button
          type="button"
          className={styles.retry}
          onClick={() => setTrigger((prev) => ({ id: prev.id + 1, silent: false }))}
        >
          Retry
        </button>
      </div>
  )
}
