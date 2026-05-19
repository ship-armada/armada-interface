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
})
