// ABOUTME: Send/Withdraw review step — frost card with left-aligned UI title + big mono amount, shared TransferReviewSummary table, Confirm/Back CTAs.
// ABOUTME: Delegates the summary rows (date, private account, recipient, fees, total + privacy notice) to TransferReviewSummary; keeps the sync-gate notice + submit disabling.

import { HighFeeNotice } from '@/components/flow/HighFeeNotice'
import { useHighFeeAck } from '@/hooks/useHighFeeAck'
import { Button, modalStepBodyEnter, modalActionRowEnter } from '@/design'
import type { CctpFeeFigure } from '@/lib/fees/txFigures'
import { TransferReviewSummary } from './TransferReviewSummary'
import { FeeUpdatedBanner } from '@/components/flow/FeeUpdatedBanner/FeeUpdatedBanner'
import { MergeNotesNotice } from '@/components/consolidate/MergeNotesNotice'
import { FirstSendNotice } from './FirstSendNotice'
import { formatUsdcPlain } from '@/lib/format'
import { isShieldedAddress } from '@/lib/address'
import type { SendFlowVariant } from './SendRecipientStep'
import styles from './SendReviewStep.module.css'

export interface SendReviewStepProps {
  variant: SendFlowVariant
  recipient: string
  /** The user's own shielded (Armada) address — rendered as the summary's "From your private account" row. */
  armadaAddress?: string
  amount: bigint
  /** The fee charged on top of the amount — the relayer fee (+ any protocol fee). Rendered as "—" when null. */
  fee: bigint | null
  /** A cross-chain unshield's CCTP fee — taken from the amount in transit, so not part of `fee` or the total — and
   *  whether it's still the estimate. Shown on its own row; the Fees row then reads "Relayer fee". */
  cctpFee?: CctpFeeFigure | null
  /** USDC deducted from the user's shielded balance — `amount + fee` across all three kinds; null ("—") until the fee is known. */
  totalDeducted: bigint | null
  /** Destination chain name — shown on the summary's Network row for public (0x) recipients. */
  networkName?: string
  /** Wallet provider name for a public recipient's brand glyph (only when it's the user's own wallet). */
  recipientWalletProvider?: string
  submitBlockedReason?: string | null
  /** True while a submit is in flight — disables Confirm so a double-click can't create two txs. */
  isSubmitting?: boolean
  /** Settled sends already made to this recipient (local history). 0 → the "New recipient" callout; more → the
   *  summary's "History" row; omitted → neither. */
  previousSendCount?: number
  /** The recipient is the user's own connected wallet — the History row says so instead of a first-send warning. */
  recipientIsOwnWallet?: boolean
  /** True when a submit-time fee refetch changed the fee — surfaces the FeeUpdatedBanner. */
  feeUpdated?: boolean
  /** Set when the wallet is too fragmented for the send — shows the "Too many small notes" callout (with its
   *  "Merge notes" button) and holds Confirm. */
  onMergeNotes?: () => void
  onBack: () => void
  onConfirm: () => void
  /** Review's "Est. time" row — how long the tx usually takes (`lib/tx/eta::estimatedTimeLabel`). */
  estimatedTime?: string
}

export function SendReviewStep({
  variant,
  recipient,
  armadaAddress,
  amount,
  fee,
  cctpFee = null,
  totalDeducted,
  networkName,
  recipientWalletProvider,
  submitBlockedReason,
  isSubmitting,
  previousSendCount,
  recipientIsOwnWallet,
  feeUpdated,
  onMergeNotes,
  onBack,
  onConfirm,
  estimatedTime,
}: SendReviewStepProps) {
  const title =
    variant === 'withdraw'
      ? 'Review unshielding transfer'
      : isShieldedAddress(recipient)
        ? 'Review your USDC shielded transfer'
        : 'Review your USDC transfer'
  const confirmLabel = variant === 'withdraw' ? 'Confirm' : 'Confirm send'
  const history = recipientHistory(previousSendCount, recipientIsOwnWallet)
  // Every fee the user loses: the relayer fee and, cross-chain, Circle's CCTP fee taken from the amount in transit.
  const highFee = useHighFeeAck(fee === null ? null : fee + (cctpFee?.amount ?? 0n), amount)

  return (
    <div className={styles.root}>
      <div className={`${styles.body} ${modalStepBodyEnter}`}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.amountRow}>
            <span className={styles.amountValue}>{formatUsdcPlain(amount)}</span>
          </div>
        </div>

        {feeUpdated ? <FeeUpdatedBanner /> : null}

        <TransferReviewSummary
          {...(estimatedTime !== undefined ? { estimatedTime } : {})}
          recipient={recipient}
          armadaAddress={armadaAddress}
          fee={fee}
          cctpFee={cctpFee}
          totalDeducted={totalDeducted}
          variant={variant}
          networkName={networkName}
          recipientWalletProvider={recipientWalletProvider}
          recipientHistory={history?.kind === 'known' ? history.text : undefined}
        />

        {history?.kind === 'first' ? <FirstSendNotice /> : null}
        <HighFeeNotice
          level={highFee.level}
          percent={highFee.percent}
          acknowledged={highFee.acknowledged}
          onAcknowledge={highFee.setAcknowledged}
        />
        {onMergeNotes ? <MergeNotesNotice onAction={onMergeNotes} /> : null}

        {submitBlockedReason ? (
          <div className={styles.syncNotice} role="status" aria-live="polite">
            {submitBlockedReason}
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
          label={confirmLabel}
          showIcon={false}
          className={styles.confirmButton}
          onClick={onConfirm}
          disabled={Boolean(submitBlockedReason) || Boolean(onMergeNotes) || isSubmitting || highFee.blocksConfirm}
        />
      </div>
    </div>
  )
}

/**
 * The user's history with this recipient. A first-time recipient is the moment a mistyped or lookalike address is
 * most likely, so it gets a warning callout asking for a careful check; a known one is a quiet "History" row in the
 * summary. Null when no count was provided.
 */
function recipientHistory(
  previousSendCount: number | undefined,
  recipientIsOwnWallet: boolean | undefined,
): { kind: 'first' } | { kind: 'known'; text: string } | null {
  if (recipientIsOwnWallet) return { kind: 'known', text: '(Your connected wallet)' }
  if (previousSendCount === undefined) return null
  if (previousSendCount === 0) return { kind: 'first' }
  if (previousSendCount === 1) return { kind: 'known', text: 'Sent once before' }
  return { kind: 'known', text: `Sent ${previousSendCount} times before` }
}
