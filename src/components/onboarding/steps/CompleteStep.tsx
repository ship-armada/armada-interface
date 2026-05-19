// ABOUTME: Step 5 of onboarding — celebratory "You're in" panel; single Done CTA returns to the Dashboard.
// ABOUTME: This step is only shown after createWallet succeeds. The actual atom write (status='unlocked') is the parent's responsibility.

import { CheckCircle2 } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './CompleteStep.module.css'

export interface CompleteStepProps {
  onDone: () => void
}

export function CompleteStep({ onDone }: CompleteStepProps) {
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <CheckCircle2 size={40} />
      </div>
      <h3 className={styles.title}>You're in</h3>
      <p className={styles.body}>
        Your private USDC account is ready. You can now deposit, withdraw, send, and earn —
        all privately.
      </p>
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Go to dashboard', onClick: onDone }}
      />
    </div>
  )
}
