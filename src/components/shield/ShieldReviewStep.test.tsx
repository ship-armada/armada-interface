// ABOUTME: Tests for ShieldReviewStep — renders amount + chain name + dispatches Back/Confirm.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShieldReviewStep } from './ShieldReviewStep'

function setup() {
  const onBack = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ShieldReviewStep
      fromChainId={31337}
      amount={100_500_000n}
      fee={null}
      netAmount={100_500_000n}
      onBack={onBack}
      onConfirm={onConfirm}
    />,
  )
  return { onBack, onConfirm }
}

describe('<ShieldReviewStep>', () => {
  it('renders the amount and chain name', () => {
    setup()
    // Amount appears in the hero numeral AND in the FeeSummary's net-amount row (fee=null →
    // netAmount=amount in this test). Use getAllByText since both spots match.
    expect(screen.getAllByText('100.50').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Anvil Hub/)).toBeInTheDocument()
  })

  it('fires onConfirm on the primary CTA', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Confirm deposit/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('fires onBack on the secondary CTA', () => {
    const { onBack } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
