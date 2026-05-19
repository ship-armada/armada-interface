// ABOUTME: Earn input step — tab switcher (Add Funds / Withdraw) + amount + APY hint + fee summary.
// ABOUTME: APY display is honest about its source: shows "—" with disclaimer when useYieldRate is unwired or rateToApy returns 0.

import { AmountInput, FeeSummary, Tabs } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { parseUsdcInput } from '@/lib/format'
import { rateToApy } from '@/lib/yield'
import type { YieldRate } from '@/hooks/useYieldRate'
import styles from './EarnInputStep.module.css'

export type EarnTab = 'add' | 'withdraw'

const TABS = [
  { id: 'add' as const, label: 'Add funds' },
  { id: 'withdraw' as const, label: 'Withdraw' },
] as const

export interface EarnInputStepProps {
  tab: EarnTab
  onTabChange: (next: EarnTab) => void
  amountStr: string
  onAmountChange: (next: string) => void
  /** Max amount for the active tab — shieldedUsdc for Add, earning balance for Withdraw. */
  max: bigint
  /** Current yield rate; null while syncing. Drives the APY hint copy. */
  rate: YieldRate | null
  fee: bigint | null
  netAmount: bigint
  isFeeRefreshing?: boolean
  onCancel: () => void
  onContinue: () => void
}

function formatApy(rate: YieldRate | null): string {
  if (!rate) return 'syncing…'
  const apy = rateToApy(rate.rate)
  if (apy === 0) return 'unavailable while vault rate syncs'
  return `~${apy.toFixed(2)}%`
}

export function EarnInputStep({
  tab,
  onTabChange,
  amountStr,
  onAmountChange,
  max,
  rate,
  fee,
  netAmount,
  isFeeRefreshing,
  onCancel,
  onContinue,
}: EarnInputStepProps) {
  const amount = parseUsdcInput(amountStr)
  const tooMuch = amount > max
  const amountError = tooMuch
    ? tab === 'add'
      ? 'Amount exceeds your private balance.'
      : 'Amount exceeds your earning balance.'
    : undefined

  const isValid = amount > 0n && !tooMuch

  return (
    <div className={styles.root}>
      <Tabs items={TABS} selected={tab} onSelect={onTabChange} ariaLabel="Earn mode" />
      <AmountInput
        variant="display"
        label={tab === 'add' ? 'How much to add?' : 'How much to withdraw?'}
        value={amountStr}
        onValueChange={onAmountChange}
        max={max}
        error={amountError}
      />
      <div className={styles.apyBlock}>
        <div className={styles.apyLabel}>Estimated APY</div>
        <div className={styles.apyValue}>{formatApy(rate)}</div>
        <div className={styles.apyCaveat}>
          Based on the vault's recent rate; the actual yield earned will vary.
        </div>
      </div>
      <FeeSummary
        fee={fee}
        netAmount={netAmount}
        netLabel={tab === 'add' ? "You'll be earning on" : "You'll receive"}
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
