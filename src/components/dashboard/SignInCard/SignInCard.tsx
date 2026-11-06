// ABOUTME: SignInCard — the locked dashboard's balance spot and its inline sign-in: the Connect / Sign in button (waiting for the
// ABOUTME: signature, errors), "Connected as", the signature-derived wallet line, the restore link, and a first-visit banner below.

import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { Button } from '@/design'
import type { LockReason, PaymentIntent } from '@/state/ui'
import { shortAddress } from '@/lib/address'
import { formatUsdcAmount, parseUsdcInput } from '@/lib/format'
import cardStyles from '../BalanceCard/BalanceCard.module.css'
import styles from './SignInCard.module.css'

export interface SignInCardProps {
  /** The EVM wallet: none yet, wagmi restoring the last session, or connected. */
  connection: 'disconnected' | 'reconnecting' | 'connected'
  /** The connected wallet's address, for "Connected as". */
  address?: string
  /** True while the wallet's signature prompt is open. */
  submitting?: boolean
  /** Why the last sign-in failed (declined, wrong network…). */
  error?: string | null
  /** Why the wallet locked ("Locked after 15 minutes of inactivity."), when it did. */
  lockNote?: string | null
  /** A pay link waiting on sign-in ("Sign in to pay 25.00 USDC to 0zk1…ab12") — shown instead of the lock note. */
  payNote?: string | null
  /** No wallet signed in on this device yet: the first sign-in asks for two signatures (the determinism check). */
  firstTimeOnDevice?: boolean
  /** Connect (if needed) and sign in. */
  onSignIn: () => void
  /** Open the restore (backup file / recovery secret). */
  onRestore: () => void
}

/** The card's line on why the wallet locked; null when it wasn't an auto-lock / "Lock now" (or hasn't locked). */
export function lockNoteFor(reason: LockReason | null, autoLockMinutes: number): string | null {
  switch (reason) {
    case 'idle':
      return `Locked after ${autoLockMinutes} minutes of inactivity.`
    case 'hidden':
      return 'Locked while the tab was in the background.'
    case 'manual':
      return 'You locked Armada.'
    default:
      return null
  }
}

/** The card's line for a pay link waiting on sign-in ("Sign in to pay 25.00 USDC to 0zk1…"); null without one. */
export function payNoteFor(intent: PaymentIntent | null): string | null {
  if (!intent) return null
  const to = shortAddress(intent.recipient)
  if (!intent.amount) return `Sign in to pay ${to}`
  return `Sign in to pay ${formatUsdcAmount(parseUsdcInput(intent.amount).value)} USDC to ${to}`
}

export function SignInCard({
  connection,
  address,
  submitting = false,
  error,
  lockNote,
  payNote,
  firstTimeOnDevice = false,
  onSignIn,
  onRestore,
}: SignInCardProps) {
  const buttonLabel =
    connection === 'reconnecting'
      ? 'Reconnecting…'
      : submitting
        ? 'Waiting for signature…'
        : connection === 'connected'
          ? 'Sign in'
          : 'Connect wallet'
  const contextNote = payNote ?? lockNote

  return (
    <>
      <section className={`${cardStyles.card} ${styles.card}`} aria-label="Sign in">
        {contextNote ? <p className={styles.note}>{contextNote}</p> : null}
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="lg"
            label={buttonLabel}
            showIcon={false}
            className={styles.signIn}
            disabled={connection === 'reconnecting' || submitting}
            loading={submitting}
            onClick={onSignIn}
          />
          {error ? (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          ) : null}
          {connection === 'connected' && address ? (
            <p className={styles.connectedAs}>Connected as {shortAddress(address)}</p>
          ) : null}
        </div>
        <p className={styles.intro}>
          Your shielded wallet is derived from a signature your EVM wallet produces — no passphrase, no recovery phrase.
          Sign in from any device with the same wallet.
        </p>
        <button type="button" className={styles.textLink} onClick={onRestore}>
          Restore wallet from backup instead
        </button>
      </section>
      {firstTimeOnDevice ? (
        <div className={styles.firstTimeBanner}>
          <span className={styles.firstTimeIconTile} aria-hidden>
            <InformationCircleIcon className={styles.firstTimeIcon} strokeWidth={1.5} />
          </span>
          <div className={styles.firstTimeText}>
            <p className={styles.firstTimeHeadline}>First time on this device?</p>
            <p className={`armada-text-ui-body-sm ${styles.firstTimeBody}`}>
              We&rsquo;ll ask for two signatures to confirm your wallet is compatible. After that it&rsquo;s a single
              signature.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
