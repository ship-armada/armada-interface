// ABOUTME: Onboarding step — prompts the user to sign the EIP-712 enrollment message with their connected EVM wallet.
// ABOUTME: Gates the Sign CTA on wagmi connection state; surfaces a "Connect wallet" button (RainbowKit) when disconnected. No mnemonic display — the recovery secret is root_secret, exported as an encrypted backup in later steps.

import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './WelcomeStep.module.css'

export interface SignEnrollmentStepProps {
  /** Called to trigger the wagmi sign prompt. Wired to useShieldedWallet().enroll() by the parent. */
  onSign: () => Promise<void>
  onBack: () => void
}

export function SignEnrollmentStep({ onSign, onBack }: SignEnrollmentStepProps) {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSign() {
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

  // Two-button states: not-connected → open RainbowKit; connected → trigger sign.
  // We intentionally do not auto-fire the sign after connect; the user explicitly clicks twice
  // so the wallet prompts (connect + sign) don't feel chained or surprising.
  const primary = isConnected
    ? {
        label: submitting ? 'Waiting for signature…' : 'Sign enrollment message',
        onClick: handleSign,
        disabled: submitting,
      }
    : {
        label: 'Connect wallet',
        onClick: openConnectModal,
        disabled: !openConnectModal,
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
      {!isConnected ? (
        <p className={styles.body} style={{ color: 'var(--semantic-color-text-muted)' }}>
          Connect your EVM wallet to continue. Your signature stays in this browser — Armada
          never receives your private key.
        </p>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: 'var(--semantic-color-status-error)' }}>{error}</div>
      ) : null}
      <FlowFooter
        className={styles.footer}
        primary={primary}
        secondary={{ label: 'Back', onClick: onBack, disabled: submitting }}
      />
    </div>
  )
}
