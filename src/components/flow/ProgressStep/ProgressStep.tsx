// ABOUTME: Shared progress step — renders the processing layout (hero card + timeline) for any TxKind from the live record.
// ABOUTME: When no record exists yet (user clicked Confirm but executor hasn't written the first transition), shows a preparing placeholder.

import type { TxRecord } from '@/lib/tx/types'
import { TxProcessingLayout } from '@/components/tx/processing/TxProcessingLayout'
import { buildProcessingView, type SendVariant } from '@/components/tx/processing/processingView'
import { stageTimingNote } from '@/lib/tx/eta'
import { easedProofProgress } from '@/lib/tx/proofProgress'
import { useNow } from '@/hooks/useNow'
import { TxCancelButton } from '@/components/tx/TxCancelButton'
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
  // Re-read the clock while it matters: ~10×/s while a proof's ring is filling (smooth), else once a second while the
  // active stage has a timing estimate (so the note can turn "slow").
  const proof = view?.proof ?? null
  const now = useNow(proof ? 100 : 1_000, Boolean(proof ?? view?.timing))

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
        {...(proof ? { proofProgress: easedProofProgress({ real: proof.real, proofs: proof.proofs, sinceMs: now - proof.since }) } : {})}
      />
      {/* While the proof is still building nothing has been sent, so the user can call it off. */}
      {record ? <TxCancelButton record={record} /> : null}
    </div>
  )
}
