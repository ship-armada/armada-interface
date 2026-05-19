// ABOUTME: Tests for StatusChip — label rendering, variant class application, optional dot, role="status".
// ABOUTME: Color values are not asserted (CSS modules are unhashed in tests); we check that variant classes differ.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusChip } from './StatusChip'

describe('<StatusChip>', () => {
  it('renders the label', () => {
    render(<StatusChip label="Complete" variant="success" />)
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('exposes status role for assistive tech', () => {
    render(<StatusChip label="Pending" variant="warning" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the dot by default', () => {
    const { container } = render(<StatusChip label="Complete" variant="success" />)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('hides the dot when showDot=false', () => {
    const { container } = render(<StatusChip label="Complete" variant="success" showDot={false} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('applies different classes per variant', () => {
    const { container, rerender } = render(<StatusChip label="x" variant="success" />)
    const a = container.firstElementChild?.className
    rerender(<StatusChip label="x" variant="error" />)
    const b = container.firstElementChild?.className
    expect(a).not.toBe(b)
  })
})
