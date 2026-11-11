// ABOUTME: Status strip (AppLayout's banner overlay, routes other than the dashboard) that surfaces the SDK's UTXO merkletree scan state.
// ABOUTME: Hidden when sync is idle or complete; visible (with progress bar) while syncing or after a failure.

import { useAtomValue } from 'jotai'
import { syncRetryEpochAtom, syncStateAtom } from '@/state/wallet'
import { useSyncRetry } from '@/hooks/useSyncRetry'
import { SUPPORT_URL } from '@/config/support'
import styles from './SyncBanner.module.css'

/**
 * Thin banner that appears below the app header during initial shielded-balance sync.
 *
 * - `syncing` → "Loading your private balance — N%. Keep this tab open until it finishes; subsequent visits are instant."
 *   Includes a progress bar driven by the SDK's MerkletreeScanStatus progress value.
 * - `failed` → "Sync interrupted — your funds are safe on chain." with an inline "Try again" button (re-runs the
 *   scan), plus "Get help" once a retry has failed too.
 * - `idle` / `complete` → not rendered (banner area collapses to nothing).
 *
 * AppLayout renders this only on non-dashboard routes (the dashboard shows its
 * `dashboard/SyncCard` in the balance spot instead). Reads syncStateAtom directly because it lives at the app-chrome layer —
 * per components/CLAUDE.md, atom reads at the chrome level are fine.
 */
export function SyncBanner() {
  const sync = useAtomValue(syncStateAtom)
  // Bumped by each "Try again" — a failure after one means retrying alone isn't fixing it.
  const retried = useAtomValue(syncRetryEpochAtom) > 0
  const retry = useSyncRetry()

  if (sync.status === 'idle' || sync.status === 'complete') return null

  const pct = Math.round(Math.max(0, Math.min(1, sync.progress)) * 100)

  if (sync.status === 'failed') {
    return (
      <div className={`${styles.banner} ${styles.failed}`} role="status" aria-live="polite">
        <span className={styles.message}>Sync interrupted — your funds are safe on chain.</span>
        {retried ? (
          <a className={styles.helpLink} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            Get help on Discord
          </a>
        ) : null}
        <button type="button" className={styles.retry} onClick={retry}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className={`${styles.banner} ${styles.syncing}`} role="status" aria-live="polite">
      <span className={styles.message}>
        First sign-in on this device — loading your private balance ({pct}%). This walks the
        chain from deploy so any prior activity for your wallet is fully discovered. Keep this tab
        open until it finishes; subsequent visits are instant.
      </span>
      <span
        className={styles.progressTrack}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Shielded balance sync progress"
      >
        <span className={styles.progressFill} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
