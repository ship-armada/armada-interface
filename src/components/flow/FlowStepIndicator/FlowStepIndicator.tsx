// ABOUTME: Segmented progress indicator for ActionFlowShell — N equal-width ticks, filled up to currentStep.
// ABOUTME: Visual reference: designer's committer mockup ("STEP 1 OF 4" + ticked bar). Brand purple fill on filled segments.

import styles from './FlowStepIndicator.module.css'

export interface FlowStepIndicatorProps {
  /** 1-based index of the current step. Values outside [1, totalSteps] are clamped. */
  currentStep: number
  /** Total number of steps in the indicator. */
  totalSteps: number
  className?: string
}

export function FlowStepIndicator({ currentStep, totalSteps, className }: FlowStepIndicatorProps) {
  const total = Math.max(1, Math.floor(totalSteps))
  const current = Math.max(1, Math.min(total, Math.floor(currentStep)))
  const cls = [styles.root, className].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      role="progressbar"
      aria-label={`Step ${current} of ${total}`}
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      <div className={styles.label}>{`Step ${current} of ${total}`}</div>
      <div className={styles.track}>
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < current
          return (
            <div
              key={i}
              className={[styles.tick, filled ? styles.filled : ''].filter(Boolean).join(' ')}
            />
          )
        })}
      </div>
    </div>
  )
}
