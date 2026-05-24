// ABOUTME: TxStatusChip — maps TxExecutionState (+ optional TxError code) to a StatusChip variant + label.
// ABOUTME: Consolidates pre-terminal states under "Pending"; distinguishes DISMISSED ("Stopped tracking") from plain CANCELLED so the user knows their on-chain tx is still live.

import { StatusChip, type StatusChipVariant } from '../ui/StatusChip'
import type { TxError, TxExecutionState } from '@/lib/tx/types'

export interface TxStatusChipProps {
  state: TxExecutionState
  /**
   * Optional error payload — used to refine the chip when execution state alone is ambiguous.
   * Specifically, a `cancelled` record with `error.code === 'DISMISSED'` reads "Stopped tracking"
   * because the on-chain tx is still running; without this hint we'd render "Cancelled" and
   * mislead the user about whether their funds moved.
   */
  error?: TxError | null
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

export function TxStatusChip({ state, error, className }: TxStatusChipProps) {
  let { variant, label } = MAP[state]
  // DISMISSED is the "user stopped tracking after broadcast" path — the chain doesn't know we
  // gave up, so the chip should communicate "we lost track" rather than the misleading "Cancelled"
  // which implies nothing happened.
  if (state === 'cancelled' && error?.code === 'DISMISSED') {
    label = 'Stopped tracking'
  }
  return <StatusChip variant={variant} label={label} className={className} />
}
