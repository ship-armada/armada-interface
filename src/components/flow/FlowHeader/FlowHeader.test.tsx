// ABOUTME: Tests for FlowHeader — title rendering, conditional close button, step indicator presence, titleId wiring.
// ABOUTME: FlowStepIndicator's own tests cover the tick/fill logic; here we only verify it renders inside the header.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FlowHeader } from './FlowHeader'

describe('<FlowHeader>', () => {
  it('renders the title', () => {
    render(<FlowHeader title="Deposit" currentStep={1} totalSteps={4} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Deposit' })).toBeInTheDocument()
  })

  it('renders the step indicator', () => {
    render(<FlowHeader title="Deposit" currentStep={2} totalSteps={4} />)
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 4' })).toBeInTheDocument()
  })

  it('does not render close button by default', () => {
    render(<FlowHeader title="Deposit" currentStep={1} totalSteps={4} />)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('renders close button when showCloseButton=true', () => {
    render(
      <FlowHeader title="Deposit" currentStep={1} totalSteps={4} showCloseButton onClose={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FlowHeader title="Deposit" currentStep={1} totalSteps={4} showCloseButton onClose={onClose} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sets the heading id when titleId is provided', () => {
    render(<FlowHeader title="Deposit" currentStep={1} totalSteps={4} titleId="flow-title" />)
    expect(screen.getByRole('heading', { name: 'Deposit' })).toHaveAttribute('id', 'flow-title')
  })

  it('hides the step indicator when showIndicator=false', () => {
    render(<FlowHeader title="Error" currentStep={1} totalSteps={4} showIndicator={false} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
