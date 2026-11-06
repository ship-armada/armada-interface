// ABOUTME: Tests for EarnReviewStep — headline + mode + APY copy + dispatch Back/Confirm, and a deposit's est. yearly yield row.
// ABOUTME: Rows are read by label via test/summaryRows.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EarnReviewStep } from './EarnReviewStep'
import { summaryRow } from '@/test/summaryRows'

function setupAdd() {
  const onBack = vi.fn()
  const onConfirm = vi.fn()
  render(
    <EarnReviewStep
      tab="add"
      amount={100_000_000n}
      rate={null}
      fee={null}
      netAmount={100_000_000n}
      netLabel="Total deducted from balance"
      onBack={onBack}
      onConfirm={onConfirm}
    />,
  )
  return { onBack, onConfirm }
}

describe('<EarnReviewStep>', () => {
  it('offers "Merge notes" in the blocked notice when merging would unblock the vault action', () => {
    const onMergeNotes = vi.fn()
    render(
      <EarnReviewStep
        tab="add"
        amount={100_000_000n}
        rate={null}
        fee={null}
        netAmount={100_000_000n}
        netLabel="Total deducted from balance"
        onMergeNotes={onMergeNotes}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Too many small notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm deposit/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Merge notes' }))
    expect(onMergeNotes).toHaveBeenCalledOnce()
  })

  it("tab=add: title 'Review USDC shielded transfer to the vault' and mode 'Add to vault'", () => {
    setupAdd()
    expect(screen.getByRole('heading', { name: 'Review USDC shielded transfer to the vault' })).toBeInTheDocument()
    expect(screen.getByText('Add to vault')).toBeInTheDocument()
  })

  it("tab=withdraw: title 'Review USDC withdraw from shielded vault' and mode 'Withdraw from vault'", () => {
    render(
      <EarnReviewStep
        tab="withdraw"
        amount={50_000_000n}
        rate={null}
        fee={null}
        netAmount={49_500_000n}
        netLabel="You'll receive into private balance"
        onBack={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Review USDC withdraw from shielded vault' })).toBeInTheDocument()
    expect(screen.getByText('Withdraw from shielded vault')).toBeInTheDocument()
  })

  it('a deposit\'s Review shows its est. yearly yield at the rate it was reviewed at (12E, YD-7)', () => {
    render(
      <EarnReviewStep
        tab="add"
        amount={100_000_000n}
        rate={{ rate: 1_000_000n, apyBps: 420n, yieldFeeBps: 1_000n, fetchedAt: 0 }}
        fee={null}
        netAmount={100_000_000n}
        netLabel="Total deducted from balance"
        onBack={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(summaryRow('Est. yearly yield')).toBe('\u2248 4.20 USDC')
  })

  it('no est. yearly yield on a withdrawal\'s Review, or before the rate loads', () => {
    setupAdd()
    expect(screen.queryByText('Est. yearly yield')).toBeNull()
  })

  it('APY shows syncing copy when rate is null', () => {
    setupAdd()
    expect(screen.getByText('syncing…')).toBeInTheDocument()
  })

  it('fires onConfirm with the right label for the add tab', () => {
    const { onConfirm } = setupAdd()
    fireEvent.click(screen.getByRole('button', { name: /Confirm deposit/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('fires onBack', () => {
    const { onBack } = setupAdd()
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('warns when the vault deposit\'s fee is over 10% of it (5D)', () => {
    render(
      <EarnReviewStep tab="add" amount={5_000_000n} rate={null} fee={1_000_000n} netAmount={6_000_000n} netLabel="Total deducted from balance" onBack={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(screen.getByRole('note', { name: 'High fees for this amount' })).toHaveTextContent('Fees are 20% of this amount.')
  })
})
