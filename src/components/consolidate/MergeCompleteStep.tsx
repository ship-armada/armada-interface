// ABOUTME: Merge-notes complete step — "Notes merged" with notes N → M and the fee summary, then what's next:
// ABOUTME: retry the blocked action, or "Merge again" when one round wasn't enough. Dumb: the modal decides.

import { Button, ConfirmedScreenLayout } from '@/design'
import { ConsolidationSummary } from './ConsolidationSummary'
import styles from '../payments/SendReviewStep.module.css'

export interface MergeCompleteStepProps {
  tokenLabel: string
  notesMerged: number
  notesCreated: number
  /** The fee actually charged (USDC). */
  fee: bigint
  /** Completion timestamp (ms) — the summary's "Date and time" row. */
  confirmedAt: number
  /** The blocked action the merge was for, in plain words ("withdrawal"). */
  blockedAction?: string
  /** Set when one merge wasn't enough for the blocked action — shows "Merge again". */
  onMergeAgain?: () => void
  /** Hub explorer URL for the merge tx; absent disables "View on explorer". */
  explorerUrl?: string
  onViewExplorer: () => void
  onDone: () => void
}

export function MergeCompleteStep({
  tokenLabel,
  notesMerged,
  notesCreated,
  fee,
  confirmedAt,
  blockedAction,
  onMergeAgain,
  explorerUrl,
  onViewExplorer,
  onDone,
}: MergeCompleteStepProps) {
  return (
    <ConfirmedScreenLayout
      title="Notes merged"
      amountLabel={`${notesMerged} → ${notesCreated}`}
      onViewExplorer={onViewExplorer}
      onGoToDashboard={onDone}
      viewExplorerDisabled={!explorerUrl}
    >
      <ConsolidationSummary
        tokenLabel={tokenLabel}
        notesMerged={notesMerged}
        notesCreated={notesCreated}
        fee={fee}
        confirmedAt={confirmedAt}
      />
      {blockedAction !== undefined && onMergeAgain ? (
        <div className={styles.feeNote} role="note">
          {`One more merge is needed before your ${blockedAction} will go through.`}
          <Button variant="secondary" size="sm" label="Merge again" showIcon={false} onClick={onMergeAgain} />
        </div>
      ) : blockedAction !== undefined ? (
        <div className={styles.feeNote} role="note">
          {`You can now retry your ${blockedAction}.`}
        </div>
      ) : null}
    </ConfirmedScreenLayout>
  )
}
