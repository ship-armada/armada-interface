// ABOUTME: Tests for MergeReviewStep — the merge review: notes N → M, the fee summary, whether the blocked
// ABOUTME: action works afterwards, the blocked-confirm notice, and the Cancel / Confirm CTAs.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MergeReviewStep, type MergeReviewStepProps } from './MergeReviewStep'

const PREVIEW = { totalFee: 40_000n, proofs: 2, notesMerged: 11, notesCreated: 2 }

function renderReview(extras: Partial<MergeReviewStepProps> = {}) {
  const props: MergeReviewStepProps = {
    tokenLabel: 'USDC',
    preview: PREVIEW,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...extras,
  }
  render(<MergeReviewStep {...props} />)
  return props
}

describe('<MergeReviewStep>', () => {
  it('shows the merge (notes in → out) and its fee', () => {
    renderReview()
    expect(screen.getByRole('heading', { name: 'Merge your USDC notes' })).toBeInTheDocument()
    expect(screen.getAllByText('11 → 2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.04 USDC')).toHaveLength(2)
  })

  it('says the blocked action will go through after the merge', () => {
    renderReview({ blockedAction: 'withdrawal', preview: { ...PREVIEW, blockedWillWork: true } })
    expect(screen.getByText('After this merge, your withdrawal will go through.')).toBeInTheDocument()
  })

  it('warns when one merge isn\'t enough for the blocked action', () => {
    renderReview({ blockedAction: 'withdrawal', preview: { ...PREVIEW, blockedWillWork: false } })
    expect(screen.getByText(/another merge before your withdrawal/)).toBeInTheDocument()
  })

  it('blocks Confirm with the reason, and shows a dash while there is no preview', () => {
    renderReview({ preview: null, submitBlockedReason: 'Working out the merge…' })
    expect(screen.getByText('Working out the merge…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm merge' })).toBeDisabled()
  })

  it('wires Cancel and Confirm', () => {
    const props = renderReview()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm merge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onConfirm).toHaveBeenCalledOnce()
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('shows the fee-updated banner when the fee changed at submit', () => {
    renderReview({ feeUpdated: true })
    expect(screen.getByText(/fee changed/)).toBeInTheDocument()
  })
})
