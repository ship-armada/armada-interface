// ABOUTME: Tests for TxStatusChip — verifies each TxExecutionState maps to the expected label.
// ABOUTME: Visual variant is encoded in CSS classes (unhashed in tests) so we only assert labels.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TxStatusChip } from './TxStatusChip'
import type { TxExecutionState } from '@/lib/tx/types'

const cases: Array<[TxExecutionState, string]> = [
  ['pending', 'Pending'],
  ['active', 'Pending'],
  ['waiting', 'Pending'],
  ['retrying', 'Retrying'],
  ['completed', 'Complete'],
  ['failed', 'Failed'],
  ['expired', 'Expired'],
  ['cancelled', 'Cancelled'],
]

describe('<TxStatusChip>', () => {
  it.each(cases)('renders %s as "%s"', (state, label) => {
    render(<TxStatusChip state={state} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('renders cancelled + DISMISSED error as "Stopped tracking"', () => {
    // The user explicitly stopped watching a post-broadcast tx. "Cancelled" would mislead them
    // into thinking the on-chain tx didn't happen — "Stopped tracking" is the honest label.
    render(
      <TxStatusChip
        state="cancelled"
        error={{ code: 'DISMISSED', message: '', txHash: '0xabc' }}
      />,
    )
    expect(screen.getByText('Stopped tracking')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  it('still renders cancelled + CANCELLED error as "Cancelled" (pre-broadcast cancel path)', () => {
    // When the cancel happened before broadcast (no txHash), the label is unchanged. The
    // distinction matters only for the dismissed path.
    render(<TxStatusChip state="cancelled" error={{ code: 'CANCELLED', message: '' }} />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })
})
