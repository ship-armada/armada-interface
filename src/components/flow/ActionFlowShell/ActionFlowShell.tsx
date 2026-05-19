// ABOUTME: ActionFlowShell — modal-wrapped multi-step flow chrome composing Modal + FlowHeader + body for Shield/Unshield/Send/Earn.
// ABOUTME: Controlled: parent owns `step` (input/review/progress/complete/error). Dismissibility is auto-derived (progress is locked).

import { useId, useMemo, type ReactNode } from 'react'
import { Modal } from '../../ui/Modal'
import { FlowHeader } from '../FlowHeader'
import styles from './ActionFlowShell.module.css'

export type FlowStep = 'input' | 'review' | 'progress' | 'complete' | 'error'

/** Steps that appear in the FlowStepIndicator (error is overlaid and never counted). */
export type FlowVisibleStep = Exclude<FlowStep, 'error'>

const DEFAULT_STEPS: ReadonlyArray<FlowVisibleStep> = ['input', 'review', 'progress', 'complete']

export interface ActionFlowShellProps {
  open: boolean
  onClose: () => void
  title: string
  step: FlowStep
  /** Visible steps in the indicator; defaults to ['input','review','progress','complete']. */
  steps?: ReadonlyArray<FlowVisibleStep>
  /**
   * When step==='error', which visible step did the failure occur on? Drives the indicator's currentStep
   * even though the indicator is hidden in error mode (kept for telemetry / future inline error display).
   */
  errorAtStep?: FlowVisibleStep
  children: ReactNode
}

export function ActionFlowShell({
  open,
  onClose,
  title,
  step,
  steps = DEFAULT_STEPS,
  errorAtStep,
  children,
}: ActionFlowShellProps) {
  const titleId = useId()

  const currentStep = useMemo(() => {
    if (step === 'error') {
      const idx = errorAtStep ? steps.indexOf(errorAtStep) : -1
      return idx >= 0 ? idx + 1 : steps.length
    }
    const idx = steps.indexOf(step as FlowVisibleStep)
    return idx >= 0 ? idx + 1 : 1
  }, [step, errorAtStep, steps])

  // Progress is the only step where we lock the user in — active executor work in flight.
  // Plan §4: wallet-signing is a sub-state of progress, not a peer; same lock applies.
  const dismissible = step !== 'progress'

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      ariaLabel={title}
      wrapBody={false}
    >
      <FlowHeader
        title={title}
        currentStep={currentStep}
        totalSteps={steps.length}
        showIndicator={step !== 'error'}
        showCloseButton={dismissible}
        onClose={onClose}
        titleId={titleId}
      />
      <div className={styles.body}>{children}</div>
    </Modal>
  )
}
