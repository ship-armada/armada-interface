// ABOUTME: Unshield complete step — success panel naming the destination chain + recipient, plus a Done CTA.
// ABOUTME: Mirrors the shield CompleteStep structure but renames the body copy to reflect "withdrew" semantics.

import { CheckCircle2 } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { formatUsdcAmount, truncateAddress } from '@/lib/format'
import { getChainById } from '@/config/network'
import styles from './UnshieldCompleteStep.module.css'

export interface UnshieldCompleteStepProps {
  destChainId: number
  recipient: string
  /** Net amount delivered (post-fee), raw 6-decimal USDC. */
  netAmount: bigint
  onDone: () => void
}

export function UnshieldCompleteStep({
  destChainId,
  recipient,
  netAmount,
  onDone,
}: UnshieldCompleteStepProps) {
  const destChain = getChainById(destChainId)
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <CheckCircle2 size={40} />
      </div>
      <h3 className={styles.title}>Withdrawal complete</h3>
      <p className={styles.body}>
        Sent {formatUsdcAmount(netAmount)} USDC to {truncateAddress(recipient)} on{' '}
        {destChain?.name ?? `chain ${destChainId}`}.
      </p>
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Done', onClick: onDone }}
      />
    </div>
  )
}
