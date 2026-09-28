// ABOUTME: Tests for MergeCompleteStep — the merge confirmation: notes in → out, the fee summary, and what to do
// ABOUTME: next (retry the blocked action, or merge again when one round wasn't enough).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MergeCompleteStep, type MergeCompleteStepProps } from './MergeCompleteStep'

function renderComplete(extras: Partial<MergeCompleteStepProps> = {}) {
  const props: MergeCompleteStepProps = {
    tokenLabel: 'USDC',
    notesMerged: 11,
    notesCreated: 2,
    fee: 40_000n,
    confirmedAt: Date.UTC(2026, 8, 25, 12, 0),
    onViewExplorer: vi.fn(),
    onDone: vi.fn(),
    ...extras,
  }
  render(<MergeCompleteStep {...props} />)
  return props
}

describe('<MergeCompleteStep>', () => {
  it('confirms the merge with its summary', () => {
    renderComplete()
    expect(screen.getByRole('heading', { name: 'Notes merged' })).toBeInTheDocument()
    expect(screen.getByText('Date and time')).toBeInTheDocument()
  })

  it('points back to the blocked action once it will go through', () => {
    renderComplete({ blockedAction: 'withdrawal' })
    expect(screen.getByText('You can now retry your withdrawal.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Merge again' })).toBeNull()
  })

  it('offers another round when one merge wasn\'t enough', () => {
    const onMergeAgain = vi.fn()
    renderComplete({ blockedAction: 'withdrawal', onMergeAgain })
    expect(screen.getByText('One more merge needed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Merge again' }))
    expect(onMergeAgain).toHaveBeenCalledOnce()
  })
})
