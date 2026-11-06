// ABOUTME: SyncCard — the balance spot while the first sync runs after sign-in: "Syncing… N%" with no figure (G-11) and no flow
// ABOUTME: buttons (they wait for the balance), and the failure state: funds safe, Try again, help after a retry.

import { ExternalLink } from 'lucide-react'
import { Button } from '@/design'
import { SUPPORT_URL } from '@/config/support'
import cardStyles from '../BalanceCard/BalanceCard.module.css'
import styles from './SyncCard.module.css'

export interface SyncCardProps {
  /** Scan progress, 0–1. */
  progress: number
  /** The first sync failed. */
  failed: boolean
  /** A "Try again" has already been made — a failure after one adds what to check and a help link. */
  retried: boolean
  /** No scan checkpoint for this wallet on this device yet: the scan starts from the beginning and takes longer. */
  firstSync: boolean
  onRetry: () => void
}

export function SyncCard({ progress, failed, retried, firstSync, onRetry }: SyncCardProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)

  return (
    <section className={`${cardStyles.card} ${styles.card}`} aria-label="Private USDC">
      {failed ? (
        <div className={styles.status} role="status" aria-live="polite">
          <div className={styles.text}>
            <h2 className={styles.title}>Sync interrupted</h2>
            <p className={styles.body}>
              Your funds are safe on chain — we just couldn’t finish loading your private balance here. This is usually
              a temporary network problem.
            </p>
          </div>
          <Button variant="primary" size="md" label="Try again" showIcon={false} onClick={onRetry} />
          {retried ? (
            <div className={styles.help}>
              <p className={styles.note}>Still not loading? Check your connection, or try again in a few minutes.</p>
              <a className={styles.helpLink} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                Get help on Discord <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.status} role="status" aria-live="polite">
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Loading your private balance"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className={styles.spinner} aria-hidden />
            <span className={styles.progressText}>{`Syncing… ${pct}%`}</span>
          </div>
          <div className={styles.text}>
            <p className={styles.body}>
              Scanning the chain to load your private balance — keep this tab open until it finishes.
            </p>
            {firstSync ? (
              <p className={styles.note}>Scanning the chain from the start — this first sync takes longer.</p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
