// ABOUTME: Shield wallet-approve step — the mockup's dedicated "step 3" wallet page (centered title + approve/sign checklist + footer).
// ABOUTME: Footer: "Preparing your shield…" (no prompt yet) → "Step X of N · Confirm in your wallet" / "· Waiting for the network to confirm".

import { modalStepBodyEnter, modalActionRowEnter } from '@/design'
import { WalletConfirmList } from '@/components/flow/WalletConfirmList/WalletConfirmList'
import type { WalletStep } from '@/lib/tx/shieldWalletSteps'
import styles from './ShieldWalletStep.module.css'

export interface ShieldWalletStepProps {
  steps: WalletStep[]
}

export function ShieldWalletStep({ steps }: ShieldWalletStepProps) {
  // A row is `loading` only while its wallet prompt is actually live, `confirming` once sent and the chain is confirming
  // it (e.g. the approval, before the shield prompt opens). Before either (proof building) every row is `pending` —
  // surface the honest "preparing" copy so the user isn't told to confirm a prompt that hasn't popped yet.
  const current = steps.findIndex((s) => s.status !== 'done')
  const position = `Step ${Math.max(0, current) + 1} of ${steps.length}`
  const footer = steps.some((s) => s.status === 'loading')
    ? `${position} \u00b7 Confirm in your wallet`
    : steps.some((s) => s.status === 'confirming')
      ? `${position} \u00b7 Waiting for the network to confirm`
      : 'Preparing your shield…'

  return (
    <div className={styles.column}>
      <div className={`${styles.body} ${modalStepBodyEnter}`}>
        <h1 className={styles.title}>Confirm transactions in your wallet</h1>
        <WalletConfirmList className={styles.confirmList} steps={steps} />
      </div>
      <div className={modalActionRowEnter}>
        <p className={styles.footerText} aria-live="polite" aria-atomic="true">
          {footer}
        </p>
      </div>
    </div>
  )
}
