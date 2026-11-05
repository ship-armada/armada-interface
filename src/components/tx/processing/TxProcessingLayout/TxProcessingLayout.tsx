// ABOUTME: Composes the in-progress hero card + timeline disclosure into a processing layout.
// ABOUTME: Ported from the armada-app design mockup.
import { modalStepBodyEnter } from '@/design'
import a11y from '@/design/styles/formA11y.module.css'
import {
  TransactionProgressDisclosure,
  type TransactionProgressVariant,
} from '../TransactionProgressDisclosure'
import { TxProgressCard, type TxProgressCardVariant } from '../TxProgressCard'
import { progressAnnouncement, type TxProgressCardCopy, type TxProgressStage } from '../processingCopy'
import { TxTimingNote } from '../TxTimingNote'
import type { StageTimingNote } from '@/lib/tx/eta'
import styles from './TxProcessingLayout.module.css'

export type TxProcessingLayoutVariant = 'default' | 'immersive'

export interface TxProcessingLayoutProps {
  cardCopy: TxProgressCardCopy
  stages: ReadonlyArray<TxProgressStage>
  activeStageIndex?: number
  completed?: boolean
  progressVariant?: TransactionProgressVariant
  /** Mobile keypad: full-bleed gradient shell, details docked at bottom. */
  layout?: TxProcessingLayoutVariant
  /** The active stage's timing note ("Usually takes ~N" / "Taking longer than usual"), shown under the timeline. */
  timingNote?: StageTimingNote | null
  /** 0..1 while a proof is being built — fills the card's ring instead of the sweep. */
  proofProgress?: number
  className?: string
}

export function TxProcessingLayout({
  cardCopy,
  stages,
  activeStageIndex = 0,
  completed = false,
  progressVariant = 'timeline',
  layout = 'default',
  timingNote = null,
  proofProgress,
  className,
}: TxProcessingLayoutProps) {
  const immersive = layout === 'immersive'
  const cardVariant: TxProgressCardVariant = immersive ? 'immersive' : 'card'
  const cls = [styles.root, immersive && styles.rootImmersive, className].filter(Boolean).join(' ')
  const bodyClassName = immersive
    ? [styles.body, styles.bodyImmersive].filter(Boolean).join(' ')
    : [modalStepBodyEnter, styles.body].filter(Boolean).join(' ')
  const statusAnnouncement = progressAnnouncement(stages, activeStageIndex, completed)

  const progressCard = (
    <TxProgressCard copy={cardCopy} variant={cardVariant} {...(proofProgress !== undefined ? { progress: proofProgress } : {})} />
  )

  return (
    <div className={cls}>
      <p className={a11y.srOnly} aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </p>
      <div className={bodyClassName}>
        {immersive ? <div className={styles.heroImmersive}>{progressCard}</div> : progressCard}

        <div
          className={[styles.belowCardStack, immersive && styles.belowCardStackImmersive]
            .filter(Boolean)
            .join(' ')}
        >
          <TransactionProgressDisclosure
            variant={progressVariant}
            stages={stages}
            activeStageIndex={activeStageIndex}
            completed={completed}
          />
          <TxTimingNote note={timingNote} />
        </div>
      </div>
    </div>
  )
}
