// ABOUTME: Wallet approval card — title inside the frost card, each prompt as an activity-style row.
// ABOUTME: The badge holds a sweeping tick ring, a static ring, or a lavender check. "In your wallet" is not shown.

import { useId } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { ActivityTickSpinner } from '@/components/ActivityTickSpinner/ActivityTickSpinner'
import styles from './WalletConfirmList.module.css'
import type { WalletStep, WalletStepStatus } from '@/lib/tx/shieldWalletSteps'

const STATUS_LABEL: Record<WalletStepStatus, string> = {
  loading: 'Loading',
  confirming: 'Confirming',
  pending: 'Pending',
  done: 'Complete',
}

export interface WalletConfirmListProps {
  title: string
  steps: WalletStep[]
  className?: string
}

export function WalletConfirmList({ title, steps, className }: WalletConfirmListProps) {
  const titleId = useId()
  const cardClassName = [styles.card, className].filter(Boolean).join(' ')

  return (
    <section className={cardClassName} aria-labelledby={titleId}>
      <h1 id={titleId} className={styles.title}>
        {title}
      </h1>
      <div className={styles.list} role="list" aria-label="Wallet confirmations" aria-live="polite">
        {steps.map((step) => (
          <div
            key={step.label}
            className={styles.row}
            role="listitem"
            aria-label={`${step.label}, ${STATUS_LABEL[step.status]}`}
          >
            <span className={styles.badge} aria-hidden>
              {step.status === 'loading' || step.status === 'confirming' ? <ActivityTickSpinner /> : null}
              {step.status === 'pending' ? <ActivityTickSpinner variant="static" /> : null}
              {step.status === 'done' ? (
                <CheckIcon className={styles.checkIcon} strokeWidth={1.5} />
              ) : null}
            </span>
            <span className={styles.copy}>
              <span className={styles.label}>{step.label}</span>
              {step.why ? <span className={styles.why}>{step.why}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
