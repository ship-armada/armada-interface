// ABOUTME: Tests for AddressReveal — the row controls for a recipient: the shortened address as a show/hide toggle
// ABOUTME: (controlled by the caller, which renders the full address below the row) and a copy button for the FULL address.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AddressReveal } from './AddressReveal'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<AddressReveal>', () => {
  it('is a show/hide toggle that reports taps and reflects the expanded state', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<AddressReveal address={ZK} expanded={false} onToggle={onToggle} />)
    const toggle = screen.getByRole('button', { name: 'Show full address' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<AddressReveal address={ZK} expanded onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: 'Hide full address' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('copies the full address and confirms', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<AddressReveal address={ZK} expanded={false} onToggle={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    })
    expect(writeText).toHaveBeenCalledWith(ZK)
    expect(screen.getByRole('button', { name: 'Address copied' })).toBeInTheDocument()
  })
})
