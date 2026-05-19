// ABOUTME: Tests for SectionHeader — renders the title text, supports trailing slot, and uses the requested heading level.
// ABOUTME: Default heading level is h2; passing `as` swaps the rendered tag without changing visible size.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionHeader } from './SectionHeader'

describe('<SectionHeader>', () => {
  it('renders the title inside an h2 by default', () => {
    render(<SectionHeader title="Activity" />)
    const heading = screen.getByRole('heading', { level: 2, name: 'Activity' })
    expect(heading).toBeInTheDocument()
  })

  it('changes the heading level via the `as` prop', () => {
    render(<SectionHeader title="Profile" as="h3" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Profile' })).toBeInTheDocument()
  })

  it('renders the trailing slot when provided', () => {
    render(<SectionHeader title="Activity" trailing={<a href="#">View all</a>} />)
    expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument()
  })

  it('omits the trailing wrapper when no trailing slot is given', () => {
    const { container } = render(<SectionHeader title="Activity" />)
    expect(container.querySelectorAll('div').length).toBe(1)
  })
})
