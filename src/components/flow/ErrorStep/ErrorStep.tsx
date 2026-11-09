// ABOUTME: Shared error step — circular error icon + category-aware headline + message (+ where the USDC is) + optional explorer link + "Get help" + Try Again / View Details CTAs.
// ABOUTME: Picks honest copy based on `error.code`: POLL_TIMEOUT / DISMISSED surface "may still complete" + an explorer link; TX_REVERTED is unambiguous failure; USER_REJECTED is friendly.

import { AlertCircle, ExternalLink } from 'lucide-react'
import { FlowFooter } from '../FlowFooter'
import type { TxError } from '@/lib/tx/types'
import { resolveTxErrorCopy } from '@/lib/tx/errorCopy'
import { SUPPORT_URL } from '@/config/support'
import styles from './ErrorStep.module.css'

export interface ErrorStepProps {
  /**
   * Categorised error to render. Wins over `message` when present — surfaces the right title,
   * supporting copy, and (for POLL_TIMEOUT / DISMISSED) an explorer link.
   */
  error?: TxError | null
  /**
   * Fallback supporting message — used when no typed `error` is supplied (e.g. the modal caught a
   * submit-time throw before any record was created).
   */
  message?: string
  /**
   * Pre-built explorer URL (e.g. `https://sepolia.etherscan.io/tx/0x...`). Modal computes this
   * from `error.txHash` + the appropriate chain id since ErrorStep itself doesn't know which
   * chain the hash lives on.
   */
  explorerUrl?: string
  /** Primary action handler. Omit to disable the button. */
  onRetry?: () => void
  /**
   * Primary button label. Defaults to "Try again". Modals pass "Start over" when the failing stage
   * isn't retryable in place (e.g. build-proof, FEE_EXPIRED) and the action returns to the form for
   * a fresh transaction rather than re-running the dead stage. (S-M3)
   */
  primaryLabel?: string
  /** View Details handler — shows a "View details" button when set. No flow passes one at present. */
  onViewDetails?: () => void
  /**
   * An in-app fix for this error (e.g. "Merge notes" for a too-fragmented wallet). When set it becomes the
   * primary button and the retry / start-over action moves to the secondary slot.
   */
  remedy?: { label: string; onClick: () => void }
  /** The user's own wallet sent (and paid gas for) the failed tx — a TX_REVERTED body then says the fee was spent
   *  (`lib/tx/errorCopy::userPaidNetworkFee`). Only the direct-path shield sets this; every spend is relayer-paid. */
  userPaidNetworkFee?: boolean
  /** The tx failed while it was still being built, so nothing was sent — a network error then says so instead of "may
   *  or may not have gone through" (`lib/tx/errorCopy::failedBeforeSending(record)`). */
  failedBeforeSending?: boolean
  /** Where the user's USDC is after this failure ("Your USDC is still in your private balance."), appended to the body.
   *  Modals pass `lib/tx/errorCopy::fundsNote(record)`, which is null whenever that isn't certain. */
  fundsNote?: string | null
}

export function ErrorStep({
  error,
  message,
  explorerUrl,
  onRetry,
  primaryLabel = 'Try again',
  onViewDetails,
  remedy,
  userPaidNetworkFee,
  failedBeforeSending,
  fundsNote,
}: ErrorStepProps) {
  // Category-aware copy (shared with the ActivityReceipt) — prefers the code's stock body over the
  // raw error.message (often technical), falling back to the bare message prop for submit-time throws.
  const { title, body } = resolveTxErrorCopy(error, message, { userPaidNetworkFee, failedBeforeSending, fundsNote })

  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <AlertCircle size={36} />
      </div>
      <div className={styles.title}>{title}</div>
      {body ? <div className={styles.message}>{body}</div> : null}
      {explorerUrl ? (
        <a
          className={styles.explorerLink}
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on block explorer <ExternalLink size={14} aria-hidden="true" />
        </a>
      ) : null}
      {/* A plain link — nothing prefilled, so no tx details end up in a public channel. */}
      <a className={styles.helpLink} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
        Get help on Discord <ExternalLink size={14} aria-hidden="true" />
      </a>
      {remedy ? (
        <FlowFooter
          className={styles.footer}
          primary={{ label: remedy.label, onClick: remedy.onClick }}
          secondary={onRetry ? { label: primaryLabel, onClick: onRetry } : undefined}
        />
      ) : (
        <FlowFooter
          className={styles.footer}
          primary={{ label: primaryLabel, onClick: onRetry, disabled: !onRetry }}
          secondary={
            onViewDetails ? { label: 'View details', onClick: onViewDetails } : undefined
          }
        />
      )}
    </div>
  )
}
