// ABOUTME: Shield wallet-approve step — the confirmation title lives inside the frost checklist card.
// ABOUTME: No step counter and no "In your wallet" line. Each prompt is an activity-style row.

import { modalStepBodyEnter } from '@/design'
import { WalletConfirmList } from '@/components/flow/WalletConfirmList/WalletConfirmList'
import type { WalletStep } from '@/lib/tx/shieldWalletSteps'
import styles from './ShieldWalletStep.module.css'

export interface ShieldWalletStepProps {
  steps: WalletStep[]
}

export function ShieldWalletStep({ steps }: ShieldWalletStepProps) {
  return (
    <div className={styles.column}>
      <div className={modalStepBodyEnter}>
        <WalletConfirmList title="Confirm transactions in your wallet" steps={steps} />
      </div>
    </div>
  )
}
