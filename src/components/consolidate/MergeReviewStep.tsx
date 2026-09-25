// ABOUTME: Merge-notes review step — "Merge your <token> notes" with notes N → M, the fee summary, whether the
// ABOUTME: blocked action will go through afterwards, and Cancel / Confirm. Dumb: the modal supplies the plan.

import { Button, modalStepBodyEnter, modalActionRowEnter } from '@/design'
import { FeeUpdatedBanner } from '@/components/flow/FeeUpdatedBanner/FeeUpdatedBanner'
import { ConsolidationSummary } from './ConsolidationSummary'
// The send review's layout, so the merge review sits in the same visual family.
import styles from '../payments/SendReviewStep.module.css'

export interface MergeReviewStepProps {
  /** The merged token's display name ("USDC", "Vault shares"). */
  tokenLabel: string
  /** The priced merge; null while it's still being worked out (or couldn't be). */
  preview: {
    totalFee: bigint
    notesMerged: number
    notesCreated: number
    blockedWillWork?: boolean
  } | null
  /** The blocked action the merge was opened for, in plain words ("withdrawal"). */
  blockedAction?: string
  /** Why Confirm is disabled (still pricing, nothing to merge, relayer down, …). */
  submitBlockedReason?: string | null
  /** True while a submit is in flight — disables Confirm so a double-click can't create two txs. */
  isSubmitting?: boolean
  /** True when a submit-time re-price changed the fee — surfaces the FeeUpdatedBanner. */
  feeUpdated?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function MergeReviewStep({
  tokenLabel,
  preview,
  blockedAction,
  submitBlockedReason,
  isSubmitting,
  feeUpdated,
  onCancel,
  onConfirm,
}: MergeReviewStepProps) {
  const outcome =
    blockedAction === undefined || preview?.blockedWillWork === undefined
      ? null
      : preview.blockedWillWork
        ? `After this merge, your ${blockedAction} will go through.`
        : `This merges as many notes as fit in one go. You'll need another merge before your ${blockedAction} will go through.`

  return (
    <div className={styles.root}>
      <div className={`${styles.body} ${modalStepBodyEnter}`}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{`Merge your ${tokenLabel} notes`}</h1>
          <div className={styles.amountRow}>
            <span className={styles.amountValue}>
              {preview ? `${preview.notesMerged} → ${preview.notesCreated}` : '—'}
            </span>
          </div>
        </div>

        {feeUpdated ? <FeeUpdatedBanner /> : null}

        <ConsolidationSummary
          tokenLabel={tokenLabel}
          {...(preview ? { notesMerged: preview.notesMerged, notesCreated: preview.notesCreated } : {})}
          fee={preview?.totalFee ?? null}
        />

        {outcome ? (
          <div className={styles.feeNote} role="note">
            {outcome}
          </div>
        ) : null}

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
          label="Cancel"
          showIcon={false}
          className={styles.cancelButton}
          onClick={onCancel}
        />
        <Button
          variant="primary"
          size="lg"
          label="Confirm merge"
          showIcon={false}
          className={styles.confirmButton}
          onClick={onConfirm}
          disabled={Boolean(submitBlockedReason) || isSubmitting || preview === null}
        />
      </div>
    </div>
  )
}
