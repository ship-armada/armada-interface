// ABOUTME: Shared progress step — renders the processing layout (hero card + timeline) for any TxKind from the live record.
// ABOUTME: When no record exists yet (user clicked Confirm but executor hasn't written the first transition), shows a preparing placeholder.

import type { TxRecord } from '@/lib/tx/types'
import { TxProcessingLayout } from '@/components/tx/processing/TxProcessingLayout'
import { buildProcessingView, type SendVariant } from '@/components/tx/processing/processingView'
import { stageTimingNote } from '@/lib/tx/eta'
import { useNow } from '@/hooks/useNow'
import styles from './ProgressStep.module.css'

export interface ProgressStepProps {
  /** The in-flight tx record. Null when the executor hasn't created a record yet (e.g. user just clicked Confirm). */
  record: TxRecord | null
  /**
   * Send/Withdraw flow variant — disambiguates the shared `unshield-*` kinds so the hero title reads
   * "Unshielding your USDC" (send) vs "Your withdraw is in progress" (withdraw). Only the SendModal
   * passes it; other flows resolve their title from the kind alone.
   */
  sendVariant?: SendVariant
}

export function ProgressStep({ record, sendVariant }: ProgressStepProps) {
  const view = record ? buildProcessingView(record, { sendVariant }) : null
  // Re-read the clock once a second while the active stage has a timing estimate, so the note can turn "slow".
  const now = useNow(1_000, Boolean(view?.timing))

  if (!view) {
    return (
      <div className={styles.root}>
        <div className={styles.headline}>Preparing transaction</div>
        <div className={styles.sub}>Hang on a moment…</div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* Hero progress card + timeline stage disclosure (mockup), driven by the real lifecycle. */}
      <TxProcessingLayout
        cardCopy={view.cardCopy}
        stages={view.stages}
        activeStageIndex={view.activeStageIndex}
        completed={view.completed}
        timingNote={view.timing ? stageTimingNote(view.timing, now) : null}
      />
    </div>
  )
}
