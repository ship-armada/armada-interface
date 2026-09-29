// ABOUTME: Activity receipt — reopens a past tx's confirm-step view (same FlowShell chrome + frost card + review summary).
// ABOUTME: Reconstructs the summary props from the record's meta/artifacts (no stored snapshot — chunk 6b decision a); step-bar hidden, CTAs are View-on-explorer + Done.

import { type ReactNode } from 'react'
import { Button, modalStepBodyEnter, modalActionRowEnter } from '@/design'
import { FlowShell } from '@/components/flow/FlowShell'
import { useFlowExit } from '@/components/flow/useFlowExit'
import { DepositReviewSummary } from '@/components/deposit/DepositReviewSummary'
import { TransferReviewSummary } from '@/components/payments/TransferReviewSummary'
import { EarnReviewSummary } from '@/components/yield/EarnReviewSummary'
import { ConsolidationSummary } from '@/components/consolidate/ConsolidationSummary'
import { ReceivedSummary } from '@/components/dashboard/ReceivedSummary'
import { frozenApyRate, type YieldRate } from '@/hooks/useYieldRate'
import { formatUsdcPlain } from '@/lib/format'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { getChainById, getNetworkConfig } from '@/config/network'
import {
  deriveActivityStatus,
  isWithdrawToSelf,
  type DashboardActivityStatus,
} from '@/components/dashboard/txActivityAdapter'
import { resolveTxErrorCopy, type TxErrorCopy } from '@/lib/tx/errorCopy'
import { moneyMoved, txFiguresAs } from '@/lib/fees/txFigures'
import type { TxRecord } from '@/lib/tx/types'
import styles from './ActivityReceipt.module.css'

export interface ActivityReceiptProps {
  /** The record to show a receipt for; null renders nothing. */
  record: TxRecord | null
  /** Connected EVM wallet — disambiguates an unshield as a withdraw (to self) vs an external send. */
  ownWalletAddress?: string
  open: boolean
  onClose: () => void
}

/** Step-bar labels per originating flow — shown all-confirmed on the receipt (matches the mockup). */
const DEPOSIT_STEPS = ['Amount', 'Review', 'Confirm']
const SEND_STEPS = ['Recipient', 'Amount', 'Review', 'Confirm']
// A merge has no recipient or amount to pick — just review the plan and confirm.
const MERGE_STEPS = ['Review', 'Confirm']

interface ReceiptView {
  /** Header label (matches the originating flow: Shield / Send / Unshield / Earn). */
  flowLabel: string
  /** The originating flow's step-bar labels, rendered confirmed (all filled). */
  steps: string[]
  /** In-card title (e.g. "USDC shield"). */
  title: string
  /** Gross USDC amount (raw 6-decimal) shown in the big-numeral block. */
  amount: bigint
  /** The reused review summary for this kind. */
  summary: ReactNode
  /** Source-chain explorer URL; absent disables "View on explorer". */
  explorerUrl?: string
  /** Outcome bucket — drives the FlowShell status + failure banner. */
  status: DashboardActivityStatus
  /** Category-aware failure copy; null for settled/pending records. */
  errorCopy: TxErrorCopy | null
}

function buildReceiptView(record: TxRecord, ownWalletAddress?: string): ReceiptView {
  const status = deriveActivityStatus(record)
  // Only a settled record has a real confirmation time — omit the "Date and time" summary row for
  // failed/cancelled/unknown so the receipt doesn't imply it confirmed.
  const confirmedAt = status === 'settled' ? record.updatedAt : undefined
  const errorCopy =
    status === 'settled' || status === 'pending'
      ? null
      : resolveTxErrorCopy(record.artifacts.error)
  const explorerUrl = txExplorerUrl(record.walletContext.sourceChainId, displayTxHash(record))
  // A tx that failed or was cancelled before its first on-chain transaction confirmed moved no money: its fees and
  // totals read "—" (the headline stays, struck through). One that did move money shows what it was charged.
  const charged = moneyMoved(record)
  const ifCharged = <T,>(value: T): T | null => (charged ? value : null)

  switch (record.kind) {
    case 'shield':
    case 'shield-xchain': {
      const meta = (record as TxRecord<'shield' | 'shield-xchain'>).meta
      // received = amount − relayerFee − protocolFee − cctpFee — the single receipt-math source shared
      // with the completion screen so a completed shield reads identically wherever it's shown.
      const { headline: amount, fee, netAmount, estimated } = txFiguresAs(record, 'deposit')
      return {
        flowLabel: 'Shield',
        steps: DEPOSIT_STEPS,
        title: 'USDC shield',
        amount,
        explorerUrl,
        status,
        errorCopy,
        summary: (
          <DepositReviewSummary
            fromChainId={meta.fromChainId}
            amount={amount}
            fee={ifCharged(fee)}
            netAmount={ifCharged(netAmount)}
            estimated={estimated}
            confirmedAt={confirmedAt}
          />
        ),
      }
    }
    case 'transfer-shielded':
    case 'unshield-local':
    case 'unshield-xchain': {
      const meta = (record as TxRecord<'transfer-shielded' | 'unshield-local' | 'unshield-xchain'>)
        .meta
      // Fee + total from the record alone — the single receipt-math source shared with the confirmation screen.
      const { headline: amount, fee, totalDeducted, cctpFee } = txFiguresAs(record, 'spend')
      const isPrivate = record.kind === 'transfer-shielded'
      // A public unshield to your own wallet is a withdraw; otherwise (and private 0zk) it's a send.
      const asWithdraw = !isPrivate && isWithdrawToSelf(meta.recipient, ownWalletAddress)
      const networkName =
        record.kind === 'unshield-xchain'
          ? getChainById((record as TxRecord<'unshield-xchain'>).meta.toChainId)?.name
          : record.kind === 'unshield-local'
            ? getNetworkConfig().hub.name
            : undefined
      return {
        flowLabel: asWithdraw ? 'Unshield' : 'Send',
        steps: SEND_STEPS,
        title: asWithdraw ? 'USDC unshield' : 'USDC sent',
        amount,
        explorerUrl,
        status,
        errorCopy,
        summary: (
          <TransferReviewSummary
            recipient={meta.recipient}
            fee={ifCharged(fee)}
            cctpFee={ifCharged(cctpFee)}
            totalDeducted={ifCharged(totalDeducted)}
            variant={asWithdraw ? 'withdraw' : 'send'}
            networkName={networkName}
            confirmedAt={confirmedAt}
          />
        ),
      }
    }
    case 'yield-deposit':
    case 'yield-withdraw': {
      // Single receipt-math source shared with the completion screen so a completed yield op reads
      // identically wherever it's shown (withdraw's `amount` is the handler-reconciled redeemed gross).
      const { headline: amount, fee, netAmount, apyBps, estimated: yieldEstimated } = txFiguresAs(record, 'yield')
      const tab = record.kind === 'yield-deposit' ? 'add' : 'withdraw'
      const netLabel = tab === 'add' ? 'Total deducted from balance' : 'Received into private balance'
      // The reviewed net APY is frozen on the record (Tier 4) — reconstruct a minimal rate snapshot so
      // the "Estimated APY" row shows the historical value. `EarnReviewSummary` reads only `apyBps`.
      // Absent on pre-capture records → keep the row hidden (unknown, not a fabricated 0%).
      const rate: YieldRate | null = apyBps !== null ? frozenApyRate(apyBps) : null
      return {
        flowLabel: 'Earn',
        steps: DEPOSIT_STEPS,
        title: tab === 'add' ? 'Vault deposit' : 'Vault withdrawal',
        amount,
        explorerUrl,
        status,
        errorCopy,
        summary: (
          <EarnReviewSummary
            tab={tab}
            amount={amount}
            rate={rate}
            fee={ifCharged(fee)}
            netAmount={ifCharged(netAmount)}
            estimated={yieldEstimated}
            netLabel={netLabel}
            confirmedAt={confirmedAt}
            showApy={rate !== null}
          />
        ),
      }
    }
    case 'consolidate': {
      const meta = (record as TxRecord<'consolidate'>).meta
      const { headline, fee } = txFiguresAs(record, 'merge')
      return {
        flowLabel: 'Merge notes',
        steps: MERGE_STEPS,
        title: 'Notes merged',
        // A merge moves no value — the big numeral is the fee, the only USDC that left the wallet.
        amount: headline,
        explorerUrl,
        status,
        errorCopy,
        summary: (
          <ConsolidationSummary
            {...(meta.tokenSymbol !== undefined ? { tokenLabel: meta.tokenSymbol } : {})}
            {...(meta.notesMerged !== undefined ? { notesMerged: meta.notesMerged } : {})}
            {...(meta.notesCreated !== undefined ? { notesCreated: meta.notesCreated } : {})}
            fee={ifCharged(fee)}
            {...(confirmedAt !== undefined ? { confirmedAt } : {})}
          />
        ),
      }
    }
    case 'transfer-shielded-received': {
      const meta = (record as TxRecord<'transfer-shielded-received'>).meta
      const { headline } = txFiguresAs(record, 'received')
      return {
        flowLabel: 'Received',
        steps: DEPOSIT_STEPS,
        title: 'USDC received',
        amount: headline,
        explorerUrl,
        status,
        errorCopy,
        // The recipient pays nothing and the amount is the headline, so no Fees or Total; the sender is anonymous
        // unless they disclosed their address.
        summary: (
          <ReceivedSummary
            {...(meta.senderShieldedAddress !== undefined ? { senderShieldedAddress: meta.senderShieldedAddress } : {})}
            {...(meta.memoText !== undefined ? { memoText: meta.memoText } : {})}
            {...(confirmedAt !== undefined ? { confirmedAt } : {})}
          />
        ),
      }
    }
  }
}

export function ActivityReceipt({ record, ownWalletAddress, open, onClose }: ActivityReceiptProps) {
  const view = record ? buildReceiptView(record, ownWalletAddress) : null

  // Play the slide-down exit before the parent unmounts us (mockup parity with the flow modals).
  const { exiting, requestClose } = useFlowExit(onClose)

  // Settled → confirmed chrome; a definitive failure/cancel → error chrome; an indeterminate
  // (unknown) or pending outcome stays neutral.
  const shellStatus: 'default' | 'confirmed' | 'error' =
    view?.status === 'settled'
      ? 'confirmed'
      : view?.status === 'failed' || view?.status === 'cancelled'
        ? 'error'
        : 'default'

  return (
    <FlowShell
      open={open && view !== null}
      exiting={exiting}
      onClose={requestClose}
      flowLabel={view?.flowLabel ?? 'Activity'}
      steps={view?.steps ?? DEPOSIT_STEPS}
      currentStep={view?.steps.length ?? DEPOSIT_STEPS.length}
      status={shellStatus}
    >
      {view ? (
        <div className={`${modalStepBodyEnter} ${styles.root}`}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{view.title}</h1>
            <div className={styles.amountRow}>
              <span
                className={[
                  styles.amountValue,
                  view.status === 'failed' && styles.amountValueFailed,
                  view.status === 'cancelled' && styles.amountValueCancelled,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {formatUsdcPlain(view.amount)}
              </span>
            </div>
          </div>

          {view.errorCopy ? (
            <div
              className={[
                styles.statusBanner,
                view.status === 'unknown' ? styles.statusBannerUnknown : styles.statusBannerError,
              ].join(' ')}
              role="status"
            >
              <span className={styles.statusBannerTitle}>{view.errorCopy.title}</span>
              {view.errorCopy.body ? (
                <span className={styles.statusBannerBody}>{view.errorCopy.body}</span>
              ) : null}
            </div>
          ) : null}

          {view.summary}

          <div className={`${modalActionRowEnter} ${styles.buttonRow}`}>
            <Button
              variant="secondary"
              size="lg"
              label="View on explorer"
              showIcon={false}
              className={styles.cancelButton}
              disabled={!view.explorerUrl}
              onClick={() => {
                if (view.explorerUrl) window.open(view.explorerUrl, '_blank', 'noopener,noreferrer')
              }}
            />
            <Button
              variant="primary"
              size="lg"
              label="Done"
              showIcon={false}
              className={styles.confirmButton}
              onClick={requestClose}
            />
          </div>
        </div>
      ) : null}
    </FlowShell>
  )
}
