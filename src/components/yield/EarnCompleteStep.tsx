// ABOUTME: Earn complete step — success copy adapts to add (moved into vault) vs withdraw (returned to private balance).
// ABOUTME: Mirrors the other CompleteStep shapes for visual consistency.

import { CheckCircle2 } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { formatUsdcAmount } from '@/lib/format'
import type { EarnTab } from './EarnInputStep'
import styles from './EarnCompleteStep.module.css'

export interface EarnCompleteStepProps {
  tab: EarnTab
  netAmount: bigint
  onDone: () => void
}

export function EarnCompleteStep({ tab, netAmount, onDone }: EarnCompleteStepProps) {
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <CheckCircle2 size={40} />
      </div>
      <h3 className={styles.title}>
        {tab === 'add' ? 'Earning' : 'Withdrawn from vault'}
      </h3>
      <p className={styles.body}>
        {tab === 'add'
          ? <>You're now earning yield on {formatUsdcAmount(netAmount)} USDC.</>
          : <>Returned {formatUsdcAmount(netAmount)} USDC to your private balance.</>}
      </p>
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Done', onClick: onDone }}
      />
    </div>
  )
}
