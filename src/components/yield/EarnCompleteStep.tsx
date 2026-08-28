// ABOUTME: Earn complete step — confirm layout with EarnReviewSummary + explorer/dashboard CTAs.
// ABOUTME: Presentation via design ConfirmedScreenLayout (armada-app EarnConfirmedScreen parity).

import { ConfirmedScreenLayout } from '@/design'
import { EarnReviewSummary } from './EarnReviewSummary'
import { formatUsdcPlain } from '@/lib/format'
import type { YieldRate } from '@/hooks/useYieldRate'
import type { EarnTab } from './EarnInputStep'

export interface EarnCompleteStepProps {
  tab: EarnTab
  /** Requested USDC (raw 6-decimal) — shown full-precision in the coin block. */
  amount: bigint
  rate: YieldRate | null
  /** Inclusive fee total — broadcaster + protocol. Rendered as "—" when null. */
  fee: bigint | null
  /** Per-tab summary total: Add → private-balance debit (`amount + fee`); Withdraw → net gain (`amount`). */
  netAmount: bigint
  netLabel: string
  /** Completion timestamp (ms) — drives the summary's "Date and time" row. */
  confirmedAt: number
  /** Hub-chain explorer URL for the tx; absent disables the "View on explorer" button. */
  explorerUrl?: string
  onViewExplorer: () => void
  onGoToDashboard: () => void
}

export function EarnCompleteStep({
  tab,
  amount,
  rate,
  fee,
  netAmount,
  netLabel,
  confirmedAt,
  explorerUrl,
  onViewExplorer,
  onGoToDashboard,
}: EarnCompleteStepProps) {
  const title = tab === 'add' ? 'USDC shielded transfer to vault complete' : 'USDC withdrawal complete'

  return (
    <ConfirmedScreenLayout
      title={title}
      amountLabel={formatUsdcPlain(amount)}
      onViewExplorer={onViewExplorer}
      onGoToDashboard={onGoToDashboard}
      viewExplorerDisabled={!explorerUrl}
    >
      <EarnReviewSummary
        tab={tab}
        amount={amount}
        rate={rate}
        fee={fee}
        netAmount={netAmount}
        netLabel={netLabel}
        confirmedAt={confirmedAt}
      />
    </ConfirmedScreenLayout>
  )
}
