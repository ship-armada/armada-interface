// ABOUTME: Onboarding step — prompts the user to sign the EIP-712 enrollment message with their connected EVM wallet.
// ABOUTME: Drives useShieldedWallet().enroll(); shows in-flight + error states. No mnemonic display — the recovery secret is root_secret, exported as an encrypted backup in later steps.

import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './WelcomeStep.module.css'

export interface SignEnrollmentStepProps {
  /** Called to trigger the wagmi sign prompt. Wired to useShieldedWallet().enroll() by the parent. */
  onSign: () => Promise<void>
  onBack: () => void
}

export function SignEnrollmentStep({ onSign, onBack }: SignEnrollmentStepProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setSubmitting(true)
    try {
      await onSign()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <PenLine size={40} />
      </div>
      <h3 className={styles.title}>Sign to generate your keys</h3>
      <p className={styles.body}>
        Your privacy keys are derived from a signature your EVM wallet produces against a fixed
        message. The signing prompt explains that this is <strong>not a transaction</strong> — no
        funds move, no chain state changes.
      </p>
      {error ? (
        <div role="alert" style={{ color: 'var(--semantic-color-status-error)' }}>{error}</div>
      ) : null}
      <FlowFooter
        className={styles.footer}
        primary={{
          label: submitting ? 'Waiting for signature…' : 'Sign enrollment message',
          onClick: handleClick,
          disabled: submitting,
        }}
        secondary={{ label: 'Back', onClick: onBack, disabled: submitting }}
      />
    </div>
  )
}
