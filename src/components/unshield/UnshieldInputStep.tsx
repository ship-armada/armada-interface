// ABOUTME: Unshield input step — destination chain + recipient + amount + fee summary, with cross-chain notice when the destination is a client chain.
// ABOUTME: Validates amount > 0 ≤ max AND recipient is a valid EVM address; disables Continue until both hold.

import { AmountInput, ChainSelect, FeeSummary, RecipientInput } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { parseUsdcInput, usdcInputErrorMessage } from '@/lib/format'
import { isEvmAddress } from '@/lib/address'
import { getNetworkConfig } from '@/config/network'
import styles from './UnshieldInputStep.module.css'

export interface UnshieldInputStepProps {
  destChainId: number
  onDestChainIdChange: (chainId: number) => void
  recipient: string
  onRecipientChange: (next: string) => void
  amountStr: string
  onAmountChange: (next: string) => void
  /** Max from shieldedUsdcAtom. */
  max: bigint
  fee: bigint | null
  netAmount: bigint
  isFeeRefreshing?: boolean
  onCancel: () => void
  onContinue: () => void
}

export function UnshieldInputStep({
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
  onCancel,
  onContinue,
}: UnshieldInputStepProps) {
  const hubChainId = getNetworkConfig().hub.chainId
  const isXchain = destChainId !== hubChainId

  const { value: amount, error: parseError } = parseUsdcInput(amountStr)
  const tooMuch = amount > max
  // Parser-side errors (too-many-decimals etc) take precedence over balance-bound errors.
  const amountError = usdcInputErrorMessage(parseError)
    ?? (tooMuch ? 'Amount exceeds your private balance.' : undefined)

  const recipientTrimmed = recipient.trim()
  // Empty recipient is allowed (no error shown); validation only kicks in once the user types something.
  const recipientInvalid = recipientTrimmed.length > 0 && !isEvmAddress(recipientTrimmed)
  const recipientError = recipientInvalid ? 'Enter a valid EVM address (0x… 42 chars).' : undefined

  const isValid =
    amount > 0n &&
    !tooMuch &&
    !parseError &&
    isEvmAddress(recipientTrimmed)

  return (
    <div className={styles.root}>
      <ChainSelect
        label="To chain"
        value={destChainId}
        onChange={onDestChainIdChange}
      />
      {isXchain ? (
        <div className={styles.xchainNotice}>
          Cross-chain withdrawal takes a few minutes for the CCTP confirmation.
        </div>
      ) : null}
      <RecipientInput
        label="Recipient address"
        value={recipient}
        onValueChange={onRecipientChange}
        error={recipientError}
        placeholder="0x…"
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
        netLabel="You'll receive"
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
