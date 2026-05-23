// ABOUTME: Step 1 of onboarding — welcomes the user and explains the private account before any keys are generated.
// ABOUTME: Primary CTA "Create account"; optional secondary "Restore from backup" surfaces when onRestore is supplied (new device / cleared storage path).

import { ShieldCheck } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './WelcomeStep.module.css'

export interface WelcomeStepProps {
  onContinue: () => void
  /**
   * Switch to the restore-from-backup flow. Only passed by App.tsx when the user has no
   * existing wallet on this device — handles the "new device" / "cleared storage" case where
   * the user already has a backup but the app would otherwise route them through Create.
   */
  onRestore?: () => void
}

export function WelcomeStep({ onContinue, onRestore }: WelcomeStepProps) {
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
        secondary={onRestore ? { label: 'I have a backup — restore', onClick: onRestore } : undefined}
      />
    </div>
  )
}
