// ABOUTME: Tests for the EmptyState primitive — renders required title, optional icon/description/action.
// ABOUTME: Verifies the icon container is aria-hidden so screen readers skip decorative graphics.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('<EmptyState>', () => {
  it('renders the title', () => {
    render(<EmptyState title="No activity yet" />)
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Nothing here." />)
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
  })

  it('omits description when not provided', () => {
    render(<EmptyState title="Empty" />)
    expect(screen.queryByText(/Nothing here/)).toBeNull()
  })

  it('renders icon and marks it aria-hidden', () => {
    render(<EmptyState title="Empty" icon={<svg data-testid="icon" />} />)
    const icon = screen.getByTestId('icon')
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an action slot', () => {
    render(<EmptyState title="Empty" action={<button>Add</button>} />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})
