// ABOUTME: Send input step — tab switcher (Private / External) + per-tab fields. Validates the recipient format per tab.
// ABOUTME: Private tab: 0zk recipient. External tab: chain selector + 0x recipient. Both use the big-display AmountInput + FeeSummary.

import { AmountInput, ChainSelect, FeeSummary, RecipientInput, Tabs } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { parseUsdcInput } from '@/lib/format'
import { isEvmAddress, isShieldedAddress } from '@/lib/address'
import { getNetworkConfig } from '@/config/network'
import styles from './SendInputStep.module.css'

export type SendTab = 'private' | 'external'

const TABS = [
  { id: 'private' as const, label: 'Private (0zk)' },
  { id: 'external' as const, label: 'External wallet' },
] as const

export interface SendInputStepProps {
  tab: SendTab
  onTabChange: (next: SendTab) => void
  destChainId: number
  onDestChainIdChange: (chainId: number) => void
  recipient: string
  onRecipientChange: (next: string) => void
  amountStr: string
  onAmountChange: (next: string) => void
  max: bigint
  fee: bigint | null
  netAmount: bigint
  isFeeRefreshing?: boolean
  /** When set, the destination chain has no deployment manifest — block Continue and explain inline. */
  destDeploymentError?: string
  onCancel: () => void
  onContinue: () => void
}

export function SendInputStep({
  tab,
  onTabChange,
  destChainId,
  onDestChainIdChange,
  recipient,
  onRecipientChange,
  amountStr,
  onAmountChange,
  max,
  fee,
  netAmount,
  isFeeRefreshing,
  destDeploymentError,
  onCancel,
  onContinue,
}: SendInputStepProps) {
  const hubChainId = getNetworkConfig().hub.chainId
  const isXchain = tab === 'external' && destChainId !== hubChainId

  const amount = parseUsdcInput(amountStr)
  const tooMuch = amount > max
  const amountError = tooMuch ? 'Amount exceeds your private balance.' : undefined

  const recipientTrimmed = recipient.trim()
  const recipientValid =
    tab === 'private' ? isShieldedAddress(recipientTrimmed) : isEvmAddress(recipientTrimmed)
  const recipientInvalid = recipientTrimmed.length > 0 && !recipientValid
  const recipientError = recipientInvalid
    ? tab === 'private'
      ? 'Enter a valid shielded address (0zk…).'
      : 'Enter a valid EVM address (0x… 42 chars).'
    : undefined

  const isValid = amount > 0n && !tooMuch && recipientValid && !destDeploymentError

  return (
    <div className={styles.root}>
      <Tabs items={TABS} selected={tab} onSelect={onTabChange} ariaLabel="Send mode" />
      {tab === 'external' ? (
        <ChainSelect
          label="To chain"
          value={destChainId}
          onChange={onDestChainIdChange}
        />
      ) : null}
      {isXchain ? (
        <div className={styles.xchainNotice}>
          Cross-chain payment takes a few minutes for the CCTP confirmation.
        </div>
      ) : null}
      {destDeploymentError ? (
        <div className={styles.destError} role="alert">
          {destDeploymentError}
        </div>
      ) : null}
      <RecipientInput
        label="Recipient address"
        value={recipient}
        onValueChange={onRecipientChange}
        error={recipientError}
        placeholder={tab === 'private' ? '0zk…' : '0x…'}
      />
      <AmountInput
        variant="display"
        label="How much USDC?"
        value={amountStr}
        onValueChange={onAmountChange}
        max={max}
        error={amountError}
      />
      <FeeSummary
        fee={fee}
        netAmount={netAmount}
        netLabel="They'll receive"
        isRefreshing={isFeeRefreshing}
      />
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Continue', onClick: onContinue, disabled: !isValid }}
        secondary={{ label: 'Cancel', onClick: onCancel }}
      />
    </div>
  )
}
