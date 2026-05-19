// ABOUTME: Step 1 of onboarding — welcomes the user and explains the private account before any keys are generated.
// ABOUTME: Single primary CTA "Create account"; no secondary action since there's nowhere to go back to.

import { ShieldCheck } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './WelcomeStep.module.css'

export interface WelcomeStepProps {
  onContinue: () => void
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <ShieldCheck size={40} />
      </div>
      <h3 className={styles.title}>Create your private USDC account</h3>
      <p className={styles.body}>
        Armada keeps your USDC balance and activity private. Your privacy keys are derived from a
        signature your EVM wallet produces — no extra recovery phrase to write down. You'll create
        an optional encrypted backup so you can restore from any device.
      </p>
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Create account', onClick: onContinue }}
      />
    </div>
  )
}
