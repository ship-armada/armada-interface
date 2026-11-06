// ABOUTME: SyncCard — the balance spot's face while the first sync runs (inside BalanceSpot): an animated tick ring around the shared
// ABOUTME: Armada mark with the live percent, no balance figure (G-11), no flow buttons; and the failure: funds safe, Try again, help.

import { useMemo, type CSSProperties } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/design'
import { SUPPORT_URL } from '@/config/support'
import cardStyles from '../BalanceCard/BalanceCard.module.css'
import styles from './SyncCard.module.css'

/** Number of ticks in the animated ring (matches the tx-processing ticker). */
const TICK_COUNT = 60

/** Rotating tick ring with the live percent at its centre — around the shared Armada mark BalanceSpot draws in this space. */
function ArmadaTickRing({ pct }: { pct: number }) {
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, i) => i), [])
  return (
    <div className={styles.tickRing}>
      {ticks.map((i) => (
        <span key={i} className={styles.tick} style={{ '--i': i } as CSSProperties} aria-hidden />
      ))}
      <div
        className={styles.pct}
        role="progressbar"
        aria-label="Loading your private balance"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={styles.pctValue}>
          {pct}
          <span className={styles.pctSymbol}>%</span>
        </span>
      </div>
    </div>
  )
}

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
    <section
      className={[cardStyles.card, styles.card, failed ? '' : styles.cardSyncing].filter(Boolean).join(' ')}
      aria-label="Private USDC"
    >
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
          <ArmadaTickRing pct={pct} />
          <p className={styles.body}>
            {firstSync
              ? 'Scanning the chain to load your private balance and history — this first sync takes longer.'
              : 'Scanning the chain to load your private balance and history.'}
          </p>
        </div>
      )}
    </section>
  )
}
