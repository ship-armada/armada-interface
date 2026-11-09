// ABOUTME: The flow modals' step types and the shared 3-step indicator mapping — Amount / Review / Confirm (progress +
// ABOUTME: complete = step 3) — plus which steps show the submitted tx.

/** A flow modal's step. `error` is shown in place of the step that failed and never counted in the indicator. */
export type FlowStep = 'input' | 'review' | 'progress' | 'complete' | 'error'

/** The steps the indicator counts (error is overlaid on whichever step failed). */
export type FlowVisibleStep = Exclude<FlowStep, 'error'>

/** The indicator's colour: lavender while in progress, red on an error, green once confirmed. */
export type FlowStepIndicatorStatus = 'default' | 'error' | 'confirmed'

/** Map flow step to 1-based index for the 3-segment bar (Confirm covers progress + complete). */
export function overlayIndicatorStep(step: FlowStep): number {
  switch (step) {
    case 'input':
      return 1
    case 'review':
      return 2
    case 'progress':
    case 'complete':
    case 'error':
      return 3
    default:
      return 1
  }
}

export function overlayIndicatorStatus(step: FlowStep): FlowStepIndicatorStatus {
  if (step === 'complete') return 'confirmed'
  if (step === 'error') return 'error'
  return 'default'
}

/**
 * The steps on which a flow modal shows the tx it submitted (its progress, outcome or error). While the modal is open
 * on one of them, `useTx({ inView })` keeps that tx's toast / header notice quiet. Takes any step name, since some
 * flows add their own pre-submit steps (Send's `recipient`, Shield's `wallet`).
 */
export function showsSubmittedTx(step: string): boolean {
  return step === 'progress' || step === 'complete' || step === 'error'
}
