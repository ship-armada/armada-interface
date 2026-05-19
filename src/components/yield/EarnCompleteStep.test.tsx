// ABOUTME: Tests for EarnCompleteStep — title + body copy adapts to add vs withdraw.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EarnCompleteStep } from './EarnCompleteStep'

describe('<EarnCompleteStep>', () => {
  it("add tab: 'Earning' headline + matching body copy", () => {
    render(<EarnCompleteStep tab="add" netAmount={100_000_000n} onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Earning' })).toBeInTheDocument()
    expect(screen.getByText(/earning yield on 100\.00 USDC/)).toBeInTheDocument()
  })

  it("withdraw tab: 'Withdrawn from vault' headline + matching body", () => {
    render(<EarnCompleteStep tab="withdraw" netAmount={50_000_000n} onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Withdrawn from vault' })).toBeInTheDocument()
    expect(screen.getByText(/Returned 50\.00 USDC/)).toBeInTheDocument()
  })

  it('fires onDone on the CTA', () => {
    const onDone = vi.fn()
    render(<EarnCompleteStep tab="add" netAmount={1_000_000n} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
