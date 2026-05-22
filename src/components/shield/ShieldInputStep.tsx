// ABOUTME: Shield input step — From-chain selector, amount input (display variant), fee summary, Cancel + Continue.
// ABOUTME: Validates amount > 0 and amount <= max; disables Continue until valid.

import { AmountInput, ChainSelect, FeeSummary } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { parseUsdcInput } from '@/lib/format'
import { getNetworkConfig } from '@/config/network'
import styles from './ShieldInputStep.module.css'

export interface ShieldInputStepProps {
  fromChainId: number
  onFromChainIdChange: (chainId: number) => void
  amountStr: string
  onAmountChange: (next: string) => void
  /** Maximum amount (raw 6-decimal USDC) — sourced from useBalances().unshielded[fromChainId]. */
  max: bigint
  fee: bigint | null
  netAmount: bigint
  isFeeRefreshing?: boolean
  onCancel: () => void
  onContinue: () => void
}

export function ShieldInputStep({
  fromChainId,
  onFromChainIdChange,
  amountStr,
  onAmountChange,
  max,
  fee,
  netAmount,
  isFeeRefreshing,
  onCancel,
  onContinue,
}: ShieldInputStepProps) {
  const hubChainId = getNetworkConfig().hub.chainId
  const isXchain = fromChainId !== hubChainId
  const amount = parseUsdcInput(amountStr)
  const tooMuch = amount > max
  const isValid = amount > 0n && !tooMuch

  return (
    <div className={styles.root}>
      <ChainSelect
        label="From"
        value={fromChainId}
        onChange={onFromChainIdChange}
      />
      {isXchain ? (
        <div className={styles.xchainNotice}>
          Cross-chain deposit takes ~30 seconds to a few minutes for the CCTP confirmation. You
          can close this modal — progress is tracked in your activity history.
        </div>
      ) : null}
      <AmountInput
        variant="display"
        label="How much USDC?"
        value={amountStr}
        onValueChange={onAmountChange}
        max={max}
        error={tooMuch ? 'Amount exceeds your available balance.' : undefined}
      />
      <FeeSummary
        fee={fee}
        netAmount={netAmount}
        netLabel="You'll deposit"
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
