// ABOUTME: Unshield review step — read-only summary of the withdraw + destination + recipient, with Confirm/Back.
// ABOUTME: Adds a "Cross-chain transfer" hint when isXchain so the user knows to expect the longer lifecycle.

import { FlowFooter } from '@/components/flow/FlowFooter'
import { FeeSummary } from '@/components/ui'
import { formatUsdcAmount, truncateAddress } from '@/lib/format'
import { getChainById } from '@/config/network'
import styles from './UnshieldReviewStep.module.css'

export interface UnshieldReviewStepProps {
  destChainId: number
  recipient: string
  amount: bigint
  fee: bigint | null
  netAmount: bigint
  isXchain: boolean
  onBack: () => void
  onConfirm: () => void
}

export function UnshieldReviewStep({
  destChainId,
  recipient,
  amount,
  fee,
  netAmount,
  isXchain,
  onBack,
  onConfirm,
}: UnshieldReviewStepProps) {
  const destChain = getChainById(destChainId)
  return (
    <div className={styles.root}>
      <div className={styles.headline}>Review your withdrawal</div>
      <div className={styles.amountBlock}>
        <span className={styles.amount}>{formatUsdcAmount(amount)}</span>
        <span className={styles.unit}>USDC</span>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>To chain</dt>
          <dd>
            {destChain?.name ?? `Chain ${destChainId}`}
            {isXchain ? <span className={styles.xchainTag}>cross-chain</span> : null}
          </dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd className={styles.recipient} title={recipient}>
            {truncateAddress(recipient)}
          </dd>
        </div>
      </dl>
      <FeeSummary fee={fee} netAmount={netAmount} netLabel="You'll receive" />
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Confirm withdrawal', onClick: onConfirm }}
        secondary={{ label: 'Back', onClick: onBack }}
      />
    </div>
  )
}
