// ABOUTME: Barrel export for flow primitives — FlowFooter, ProgressStep, ErrorStep, and the overlay step helpers / types.
// ABOUTME: Re-exports each component plus its prop types. Add a line here when a new flow primitive lands.

export { FlowFooter } from './FlowFooter'
export type { FlowFooterProps, FlowAction } from './FlowFooter'

export { ProgressStep } from './ProgressStep'
export type { ProgressStepProps } from './ProgressStep'

export { ErrorStep } from './ErrorStep'
export type { ErrorStepProps } from './ErrorStep'

export type { FlowStep, FlowVisibleStep, FlowStepIndicatorStatus } from './overlayFlow'
export {
  overlayIndicatorStep,
  overlayIndicatorStatus,
  showsSubmittedTx,
} from './overlayFlow'
