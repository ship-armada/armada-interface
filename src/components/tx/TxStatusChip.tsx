// ABOUTME: TxStatusChip — maps TxExecutionState to a StatusChip variant + label.
// ABOUTME: Consolidates pre-terminal states (pending/active/waiting/retrying) under a single "Pending" badge.

import { StatusChip, type StatusChipVariant } from '../ui/StatusChip'
import type { TxExecutionState } from '@/lib/tx/types'

export interface TxStatusChipProps {
  state: TxExecutionState
  className?: string
}

interface StatusDescriptor {
  variant: StatusChipVariant
  label: string
}

const MAP: Record<TxExecutionState, StatusDescriptor> = {
  pending: { variant: 'warning', label: 'Pending' },
  active: { variant: 'warning', label: 'Pending' },
  waiting: { variant: 'warning', label: 'Pending' },
  retrying: { variant: 'warning', label: 'Retrying' },
  completed: { variant: 'success', label: 'Complete' },
  failed: { variant: 'error', label: 'Failed' },
  expired: { variant: 'neutral', label: 'Expired' },
  cancelled: { variant: 'neutral', label: 'Cancelled' },
}

export function TxStatusChip({ state, className }: TxStatusChipProps) {
  const { variant, label } = MAP[state]
  return <StatusChip variant={variant} label={label} className={className} />
}
