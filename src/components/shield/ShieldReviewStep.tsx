// ABOUTME: Shield review step — frost card with left-aligned UI title + big mono amount, shared DepositReviewSummary table, Confirm/Back CTAs.
// ABOUTME: Delegates the summary rows (network, wallet/Armada addresses, fees, total) to DepositReviewSummary; duplicate caution preserved.

import { AlertTriangle } from 'lucide-react'
import { Button, modalStepBodyEnter, modalActionRowEnter } from '@/design'
import { DepositReviewSummary } from '@/components/deposit/DepositReviewSummary'
import { FeeUpdatedBanner } from '@/components/flow/FeeUpdatedBanner/FeeUpdatedBanner'
import type { NativeGasEstimate } from '@/lib/fees/displayFees'
import { formatUsdcPlain } from '@/lib/format'
import styles from './ShieldReviewStep.module.css'

export interface ShieldReviewStepProps {
  fromChainId: number
  amount: bigint
  fee: bigint | null
  netAmount: bigint
  /** Connected EVM wallet address — rendered (truncated) as the "From your wallet" row when present. */
  walletAddress?: string
  /** Connected wallet provider name (wagmi connector) — drives the "From your wallet" brand glyph. */
  walletProvider?: string
  /** Shielded (Armada) destination address — rendered (truncated) as the "To your private account" row when present. */
  shieldedAddress?: string
  /** True while a submit is in flight — disables Confirm so a double-click can't create two txs. */
  isSubmitting?: boolean
  /** S-L7: an unresolved same-amount deposit may still be on-chain — surface a non-blocking caution. */
  duplicateWarning?: boolean
  /** True when a submit-time fee refetch changed the fee — surfaces the FeeUpdatedBanner. */
  feeUpdated?: boolean
  /** Cross-chain shield — the received total is an estimate (final depends on the CCTP fee at delivery). */
  estimated?: boolean
  /** Direct-path network-gas estimate (ETH) — adds a "Network gas" row to the summary. Null on the
   *  gasless path (relayer covers gas). */
  nativeGas?: NativeGasEstimate | null
  onBack: () => void
  onConfirm: () => void
}

export function ShieldReviewStep({
  fromChainId,
  amount,
  fee,
  netAmount,
  walletAddress,
  walletProvider,
  shieldedAddress,
  isSubmitting,
  duplicateWarning,
  feeUpdated,
  estimated,
  nativeGas,
  onBack,
  onConfirm,
}: ShieldReviewStepProps) {
  return (
    <div className={styles.root}>
      <div className={`${styles.body} ${modalStepBodyEnter}`}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Review your USDC shield</h1>
          <div className={styles.amountRow}>
            <span className={styles.amountValue}>{formatUsdcPlain(amount)}</span>
          </div>
        </div>

        {feeUpdated ? <FeeUpdatedBanner /> : null}

        <DepositReviewSummary
          fromChainId={fromChainId}
          amount={amount}
          fee={fee}
          netAmount={netAmount}
          walletAddress={walletAddress}
          walletProvider={walletProvider}
          shieldedAddress={shieldedAddress}
          estimated={estimated}
          nativeGas={nativeGas}
        />

        {duplicateWarning ? (
          <div className={styles.caution} role="alert">
            <AlertTriangle size={16} className={styles.cautionIcon} aria-hidden="true" />
            <span>
              A shield of this amount may still be processing on chain. Submitting again could
              shield twice — check Recent Activity first.
            </span>
          </div>
        ) : null}
      </div>

      <div className={`${styles.buttonRow} ${modalActionRowEnter}`}>
        <Button
          variant="secondary"
          size="lg"
          label="Back"
          showIcon={false}
          className={styles.cancelButton}
          onClick={onBack}
        />
        <Button
          variant="primary"
          size="lg"
          label="Confirm"
          showIcon={false}
          className={styles.confirmButton}
          onClick={onConfirm}
          disabled={isSubmitting}
        />
      </div>
    </div>
  )
}
