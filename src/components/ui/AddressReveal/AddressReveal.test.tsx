// ABOUTME: Tests for AddressReveal — the shortened address toggles the full address open/closed, and the copy
// ABOUTME: button writes the FULL address and confirms with "Copied".

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AddressReveal } from './AddressReveal'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<AddressReveal>', () => {
  it('shows the shortened address, and the full address only after it is tapped', () => {
    render(<AddressReveal address={ZK} />)
    const toggle = screen.getByRole('button', { name: 'Show full address' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(ZK)).toBeNull()

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide full address' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(ZK)).toBeInTheDocument()
  })

  it('copies the full address and confirms', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<AddressReveal address={ZK} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    })
    expect(writeText).toHaveBeenCalledWith(ZK)
    expect(screen.getByRole('button', { name: 'Address copied' })).toBeInTheDocument()
  })
})
