// ABOUTME: Returning-user unlock — single-screen passphrase entry; calls useShieldedWallet().unlock(id, passphrase) on submit.
// ABOUTME: No retry backoff in v1 (TODO marker present); a wrong passphrase shows a gentle inline error and stays on this screen.

import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { OnboardingShell } from './OnboardingShell'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import styles from './UnlockFlow.module.css'

export interface UnlockFlowProps {
  /** The id of the locked wallet to unlock — driven by activeRailgunWalletIdAtom at the parent level. */
  walletId: string
  /** Called when unlock succeeds. Parent flips App-level mode to "app". */
  onUnlocked: () => void
}

export function UnlockFlow({ walletId, onUnlocked }: UnlockFlowProps) {
  const { unlock } = useShieldedWallet()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputId = useId()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!passphrase) return
    setError(null)
    setSubmitting(true)
    try {
      await unlock(walletId, passphrase)
      onUnlocked()
    } catch (err) {
      // unlockWallet is stubbed today; surface the message either way.
      // TODO: add per-failure backoff after N attempts so brute-forcing isn't free.
      setError(err instanceof Error ? err.message : 'Unlock failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingShell title="Unlock your account" currentStep={1} totalSteps={1} showIndicator={false}>
      <form className={styles.root} onSubmit={handleSubmit}>
        <div className={styles.icon} aria-hidden="true">
          <Lock size={32} />
        </div>
        <p className={styles.body}>
          Enter your passphrase to decrypt your private USDC account on this device.
        </p>
        <div className={styles.field}>
          <label htmlFor={inputId} className={styles.label}>
            Passphrase
          </label>
          <input
            id={inputId}
            type="password"
            autoComplete="current-password"
            autoFocus
            className={styles.input}
            value={passphrase}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setPassphrase(e.target.value)
              setError(null)
            }}
          />
        </div>
        {error ? (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        ) : null}
        <FlowFooter
          className={styles.footer}
          primary={{
            label: submitting ? 'Unlocking…' : 'Unlock',
            type: 'submit',
            disabled: !passphrase || submitting,
          }}
        />
      </form>
    </OnboardingShell>
  )
}
