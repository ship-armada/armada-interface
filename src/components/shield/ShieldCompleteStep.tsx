// ABOUTME: Shield complete step — celebratory success panel with the deposited amount and a Done CTA.
// ABOUTME: Matches the WelcomeStep/CompleteStep style (centered icon + serif headline + body + footer).

import { CheckCircle2 } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { formatUsdcAmount } from '@/lib/format'
import styles from './ShieldCompleteStep.module.css'

export interface ShieldCompleteStepProps {
  /** Net amount deposited (post-fee), raw 6-decimal USDC. */
  netAmount: bigint
  onDone: () => void
}

export function ShieldCompleteStep({ netAmount, onDone }: ShieldCompleteStepProps) {
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <CheckCircle2 size={40} />
      </div>
      <h3 className={styles.title}>Success</h3>
      <p className={styles.body}>
        You've deposited {formatUsdcAmount(netAmount)} USDC.
      </p>
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Done', onClick: onDone }}
      />
    </div>
  )
}
