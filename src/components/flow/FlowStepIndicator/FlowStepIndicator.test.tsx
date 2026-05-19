// ABOUTME: Tests for FlowStepIndicator — renders tick count, fills up to currentStep, clamps out-of-range input, exposes progressbar role.
// ABOUTME: Color assertions are skipped (CSS modules unhashed in tests); we check fill class presence per tick.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlowStepIndicator } from './FlowStepIndicator'

describe('<FlowStepIndicator>', () => {
  it('renders the correct number of ticks', () => {
    const { container } = render(<FlowStepIndicator currentStep={2} totalSteps={4} />)
    const ticks = container.querySelectorAll('[class*="tick"]')
    expect(ticks.length).toBe(4)
  })

  it('fills ticks up to and including currentStep', () => {
    const { container } = render(<FlowStepIndicator currentStep={2} totalSteps={4} />)
    const ticks = Array.from(container.querySelectorAll('[class*="tick"]'))
    const filled = ticks.filter(t => t.className.includes('filled'))
    expect(filled.length).toBe(2)
  })

  it('renders the "Step N of M" label', () => {
    render(<FlowStepIndicator currentStep={3} totalSteps={5} />)
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument()
  })

  it('exposes role="progressbar" with aria values', () => {
    render(<FlowStepIndicator currentStep={2} totalSteps={4} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemin', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '4')
  })

  it('clamps currentStep above totalSteps', () => {
    const { container } = render(<FlowStepIndicator currentStep={99} totalSteps={3} />)
    const ticks = Array.from(container.querySelectorAll('[class*="tick"]'))
    const filled = ticks.filter(t => t.className.includes('filled'))
    expect(filled.length).toBe(3)
  })

  it('clamps currentStep below 1', () => {
    const { container } = render(<FlowStepIndicator currentStep={0} totalSteps={3} />)
    const ticks = Array.from(container.querySelectorAll('[class*="tick"]'))
    const filled = ticks.filter(t => t.className.includes('filled'))
    expect(filled.length).toBe(1)
  })
})
