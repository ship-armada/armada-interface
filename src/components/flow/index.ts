// ABOUTME: Barrel export for flow primitives — FlowStepIndicator, FlowHeader, FlowFooter (ActionFlowShell, ProgressStep, ErrorStep land in a follow-up commit).
// ABOUTME: Re-exports each component plus its prop types. Add a line here when a new flow primitive lands.

export { FlowStepIndicator } from './FlowStepIndicator'
export type { FlowStepIndicatorProps } from './FlowStepIndicator'

export { FlowHeader } from './FlowHeader'
export type { FlowHeaderProps } from './FlowHeader'

export { FlowFooter } from './FlowFooter'
export type { FlowFooterProps, FlowAction } from './FlowFooter'
