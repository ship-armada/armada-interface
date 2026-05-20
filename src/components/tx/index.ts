// ABOUTME: Barrel export for tx-related components — TxLifecycleStepper, TxRow, TxStatusChip, plus stageCopy/kindTitle/recordTitle helpers.
// ABOUTME: Consumers should import from '@/components/tx' rather than reaching into individual files.

export { TxLifecycleStepper } from './TxLifecycleStepper'
export type { TxLifecycleStepperProps } from './TxLifecycleStepper'

export { TxRow } from './TxRow'
export type { TxRowProps } from './TxRow'

export { TxStatusChip } from './TxStatusChip'
export type { TxStatusChipProps } from './TxStatusChip'

export { TxActions } from './TxActions'
export type { TxActionsProps } from './TxActions'

export { stageCopy, kindTitle, recordTitle } from './stageCopy'
