// ABOUTME: SyncCard — the balance spot while the first sync runs after sign-in: "Syncing… N%" with no figure (G-11), Shield /
// ABOUTME: Request working meanwhile (Send / Earn wait for the balance), and the failure state: funds safe, Try again, help after a retry.

import { ArrowDownIcon, ArrowRightIcon, ChartBarIcon, PlusIcon } from '@heroicons/react/24/outline'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/design'
import { BalanceActionButton } from '@/components/dashboard/BalanceActionButton'
import { SUPPORT_URL } from '@/config/support'
import type { ActionModalKind } from '@/state/ui'
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
  /** Shield / Request — the flows that don't need the private balance. */
  onAction: (kind: ActionModalKind) => void
}

export function SyncCard({ progress, failed, retried, firstSync, onRetry, onAction }: SyncCardProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)

  return (
    <section className={`${cardStyles.card} ${styles.card}`} aria-label="Private USDC">
      {failed ? (
        <div className={styles.status} role="status" aria-live="polite">
          <h2 className={styles.title}>Sync interrupted</h2>
          <p className={styles.body}>
            Your funds are safe on chain — we just couldn’t finish loading your private balance here. This is usually a
            temporary network problem.
          </p>
          <Button variant="primary" size="md" label="Try again" showIcon={false} onClick={onRetry} />
          {retried ? (
            <>
              <p className={styles.note}>Still not loading? Check your connection, or try again in a few minutes.</p>
              <a className={styles.helpLink} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                Get help on Discord <ExternalLink size={14} aria-hidden="true" />
              </a>
            </>
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
          <p className={styles.body}>
            Scanning the chain to load your private balance — keep this tab open until it finishes.
          </p>
          {firstSync ? <p className={styles.note}>Scanning the chain from the start — this first sync takes longer.</p> : null}
        </div>
      )}

      <div className={styles.actions}>
        <div className={cardStyles.actionRow}>
          <div className={cardStyles.actionEnter}>
            <BalanceActionButton
              variant="primary"
              label="Shield"
              icon={<PlusIcon strokeWidth={1.5} />}
              onClick={() => onAction('shield')}
            />
          </div>
          <div className={cardStyles.actionEnter}>
            <BalanceActionButton label="Send" icon={<ArrowRightIcon strokeWidth={1.5} />} disabled />
          </div>
          <div className={cardStyles.actionEnter}>
            <BalanceActionButton label="Request" icon={<ArrowDownIcon strokeWidth={1.5} />} onClick={() => onAction('request')} />
          </div>
          <div className={cardStyles.actionEnter}>
            <BalanceActionButton label="Earn" icon={<ChartBarIcon strokeWidth={1.5} />} disabled />
          </div>
        </div>
        <p className={styles.note}>Send and Earn open once your balance has loaded.</p>
      </div>
    </section>
  )
}
