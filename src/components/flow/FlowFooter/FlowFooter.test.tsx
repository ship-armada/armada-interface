// ABOUTME: Tests for FlowFooter — primary always rendered, secondary optional, click handlers fire, disabled state honored.
// ABOUTME: @armada/ui Button is a dependency; we verify integration by checking rendered button labels and behavior.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FlowFooter } from './FlowFooter'

describe('<FlowFooter>', () => {
  it('renders the primary button', () => {
    render(<FlowFooter primary={{ label: 'Continue', onClick: () => {} }} />)
    expect(screen.getByRole('button', { name: /Continue/ })).toBeInTheDocument()
  })

  it('does not render the secondary button when not provided', () => {
    render(<FlowFooter primary={{ label: 'Continue' }} />)
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull()
  })

  it('renders the secondary button when provided', () => {
    render(
      <FlowFooter
        primary={{ label: 'Continue' }}
        secondary={{ label: 'Back', onClick: () => {} }}
      />,
    )
    expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument()
  })

  it('fires the primary handler on click', () => {
    const onClick = vi.fn()
    render(<FlowFooter primary={{ label: 'Continue', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fires the secondary handler on click', () => {
    const onClick = vi.fn()
    render(
      <FlowFooter
        primary={{ label: 'Continue' }}
        secondary={{ label: 'Back', onClick }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables the primary button when disabled=true', () => {
    render(<FlowFooter primary={{ label: 'Continue', disabled: true }} />)
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
  })
})
