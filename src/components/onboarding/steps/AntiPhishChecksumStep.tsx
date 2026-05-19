// ABOUTME: Onboarding step — shows the anti-phish checksum derived from root_secret so the user can recognize their own wallet on later unlocks.
// ABOUTME: 12-character display (e.g. "a3f2 91c8 b7e0") with a brief explanation. Continue-only navigation.

import { Fingerprint } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './AntiPhishChecksumStep.module.css'

export interface AntiPhishChecksumStepProps {
  checksum: string
  onBack: () => void
  onContinue: () => void
}

export function AntiPhishChecksumStep({ checksum, onBack, onContinue }: AntiPhishChecksumStepProps) {
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <Fingerprint size={40} />
      </div>
      <h3 className={styles.title}>Your anti-phishing code</h3>
      <p className={styles.body}>
        This 12-character code is unique to your account. Future unlock screens display it so you
        can spot impostor sites that don't know your real keys. Write it down or commit it to memory.
      </p>
      <div className={styles.code} aria-label="Anti-phishing checksum">
        {checksum}
      </div>
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Continue', onClick: onContinue }}
        secondary={{ label: 'Back', onClick: onBack }}
      />
    </div>
  )
}
