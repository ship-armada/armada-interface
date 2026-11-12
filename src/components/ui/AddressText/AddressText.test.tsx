// ABOUTME: Tests for AddressText — a shielded address is 8 + 4 of the whole string, an EVM address is "0x" + 4 + 4, as
// ABOUTME: plain text (no bold, no muted parts), with the full address in its title; strings it can't split render unchanged.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddressText } from './AddressText'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<AddressText>', () => {
  it('shows a shielded address as the first 8 and last 4 characters, as one plain text run', () => {
    render(<AddressText address={ZK} />)
    const el = screen.getByTitle(ZK)
    expect(el).toHaveTextContent('0zk1qyk9...nce0')
    // No styled sub-parts (bold head/tail, muted prefix / "...").
    expect(el.children).toHaveLength(0)
  })

  it('shows a 0x address as "0x" + 4 + "..." + 4, as one plain text run', () => {
    const evm = '0x1234567890abcdef1234567890abcdef12345678'
    render(<AddressText address={evm} />)
    const el = screen.getByTitle(evm)
    expect(el).toHaveTextContent('0x1234...5678')
    expect(el.children).toHaveLength(0)
  })

  it('renders a string it cannot split unchanged', () => {
    render(<AddressText address="0x1234" />)
    expect(screen.getByText('0x1234')).toBeInTheDocument()
  })
})
