// ABOUTME: SignInCard — the locked dashboard's balance spot: what signing in does, a Connect / Sign in button, the wallet's public
// ABOUTME: USDC as a nudge, why it locked or which pay link is waiting, and "How this works". No action tiles before sign-in.

import { useId, useState } from 'react'
import { Button } from '@/design'
import type { LockReason, PaymentIntent } from '@/state/ui'
import { shortAddress } from '@/lib/address'
import { formatUsdcAmount, parseUsdcInput } from '@/lib/format'
import cardStyles from '../BalanceCard/BalanceCard.module.css'
import styles from './SignInCard.module.css'

export interface SignInCardProps {
  /** The EVM wallet: none yet, wagmi restoring the last session, or connected. */
  connection: 'disconnected' | 'reconnecting' | 'connected'
  /** The connected wallet's public USDC, formatted ("120.00") — a reason to sign in; null / absent hides the line. */
  publicUsdc?: string | null
  /** Why the wallet locked ("Locked after 15 minutes of inactivity."), when it did. */
  lockNote?: string | null
  /** A pay link waiting on sign-in ("Sign in to pay 25.00 USDC to 0zk1…ab12"). */
  payNote?: string | null
  /** Connect (if needed) and sign in. */
  onSignIn: () => void
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

const HOW_IT_WORKS =
  'Armada derives your private account from a signature your wallet makes — a message, not a transaction, so it costs nothing and moves nothing. Signing again with the same wallet always unlocks the same account, on any device. Your private balance and history stay encrypted until you sign.'

export function SignInCard({ connection, publicUsdc, lockNote, payNote, onSignIn }: SignInCardProps) {
  const [explainOpen, setExplainOpen] = useState(false)
  const explainId = useId()
  const buttonLabel =
    connection === 'reconnecting' ? 'Reconnecting…' : connection === 'connected' ? 'Sign in' : 'Connect wallet'

  return (
    <section className={`${cardStyles.card} ${styles.card}`} aria-labelledby={`${explainId}-heading`}>
      <div className={styles.copy}>
        {lockNote ? <p className={styles.note}>{lockNote}</p> : null}
        <h2 id={`${explainId}-heading`} className={styles.heading}>
          Your private USDC
        </h2>
        <p className={styles.body}>
          Sign a message (not a transaction) to unlock your private balance. No seed phrase — the same wallet unlocks it
          on any device.
        </p>
        {payNote ? <p className={styles.pay}>{payNote}</p> : null}
        {connection === 'connected' && publicUsdc ? (
          <p className={styles.note}>{`You have ${publicUsdc} USDC in your wallet — sign in to shield it.`}</p>
        ) : null}
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          label={buttonLabel}
          showIcon={false}
          className={styles.signIn}
          disabled={connection === 'reconnecting'}
          onClick={onSignIn}
        />
        <button
          type="button"
          className={styles.explainToggle}
          aria-expanded={explainOpen}
          aria-controls={explainId}
          onClick={() => setExplainOpen((open) => !open)}
        >
          How this works
        </button>
        {explainOpen ? (
          <p id={explainId} className={styles.explain}>
            {HOW_IT_WORKS}
          </p>
        ) : null}
      </div>

    </section>
  )
}
