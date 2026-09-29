// ABOUTME: Shield complete step — confirm layout with DepositReviewSummary + explorer/dashboard CTAs.
// ABOUTME: Presentation via design ConfirmedScreenLayout (armada-app DepositConfirmedScreen parity).

import { ConfirmedScreenLayout } from '@/design'
import { DepositReviewSummary } from '@/components/deposit/DepositReviewSummary'
import { formatUsdcPlain } from '@/lib/format'

export interface ShieldCompleteStepProps {
  fromChainId: number
  /** Gross amount deposited (pre-fee), raw 6-decimal USDC — shown full-precision in the coin block. */
  amount: bigint
  fee: bigint | null
  /** Net amount deposited (post-fee), raw 6-decimal USDC — the summary's "You'll receive". */
  netAmount: bigint
  /** True while the fee and net are estimates (a cross-chain shield whose actual CCTP fee couldn't be read). */
  estimated?: boolean
  walletAddress?: string
  walletProvider?: string
  shieldedAddress?: string
  /** Completion timestamp (ms) — drives the summary's "Date and time" row. */
  confirmedAt: number
  /** Source-chain explorer URL for the deposit tx; absent disables the "View on explorer" button. */
  explorerUrl?: string
  onViewExplorer: () => void
  onGoToDashboard: () => void
}

export function ShieldCompleteStep({
  fromChainId,
  amount,
  fee,
  netAmount,
  estimated,
  walletAddress,
  walletProvider,
  shieldedAddress,
  confirmedAt,
  explorerUrl,
  onViewExplorer,
  onGoToDashboard,
}: ShieldCompleteStepProps) {
  return (
    <ConfirmedScreenLayout
      title="USDC shield confirmed"
      amountLabel={formatUsdcPlain(amount)}
      onViewExplorer={onViewExplorer}
      onGoToDashboard={onGoToDashboard}
      viewExplorerDisabled={!explorerUrl}
    >
      <DepositReviewSummary
        fromChainId={fromChainId}
        amount={amount}
        fee={fee}
        netAmount={netAmount}
        estimated={estimated}
        walletAddress={walletAddress}
        walletProvider={walletProvider}
        shieldedAddress={shieldedAddress}
        confirmedAt={confirmedAt}
      />
    </ConfirmedScreenLayout>
  )
}
