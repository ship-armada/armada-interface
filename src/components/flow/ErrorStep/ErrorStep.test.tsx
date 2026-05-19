// ABOUTME: Tests for ErrorStep — renders default and custom title, optional message, Try Again gated on onRetry, View Details optional.
// ABOUTME: Try Again button always renders so the user has something to click; it's disabled when no retry handler is supplied.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorStep } from './ErrorStep'

describe('<ErrorStep>', () => {
  it('renders the default title', () => {
    render(<ErrorStep />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders a custom title', () => {
    render(<ErrorStep title="Withdraw failed" />)
    expect(screen.getByText('Withdraw failed')).toBeInTheDocument()
  })

  it('renders the message when provided', () => {
    render(<ErrorStep message="Relayer returned 502 Bad Gateway." />)
    expect(screen.getByText('Relayer returned 502 Bad Gateway.')).toBeInTheDocument()
  })

  it('disables Try Again when onRetry is omitted', () => {
    render(<ErrorStep />)
    expect(screen.getByRole('button', { name: /Try again/ })).toBeDisabled()
  })

  it('enables Try Again and fires onRetry on click', () => {
    const onRetry = vi.fn()
    render(<ErrorStep onRetry={onRetry} />)
    const btn = screen.getByRole('button', { name: /Try again/ })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omits the View Details button when onViewDetails is undefined', () => {
    render(<ErrorStep onRetry={() => {}} />)
    expect(screen.queryByRole('button', { name: /View details/ })).toBeNull()
  })

  it('renders the View Details button when onViewDetails is provided', () => {
    const onViewDetails = vi.fn()
    render(<ErrorStep onRetry={() => {}} onViewDetails={onViewDetails} />)
    fireEvent.click(screen.getByRole('button', { name: /View details/ }))
    expect(onViewDetails).toHaveBeenCalledTimes(1)
  })
})
