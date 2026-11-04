// ABOUTME: Tests for AddressText — a counterparty address shown as a muted fixed prefix + bold head/tail,
// ABOUTME: with the full address in its title; strings it can't split render unchanged.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddressText } from './AddressText'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<AddressText>', () => {
  it('shows the fixed prefix, then the bold 8-character head and 6-character tail', () => {
    const { container } = render(<AddressText address={ZK} />)
    const el = screen.getByTitle(ZK)
    expect(el).toHaveTextContent('0zk1qyk9nn28...9wnce0')
    const bold = Array.from(container.querySelectorAll('strong')).map((n) => n.textContent)
    expect(bold).toEqual(['qyk9nn28', '9wnce0'])
  })

  it('bolds the 4 + 4 meaningful characters of a 0x address', () => {
    const evm = '0x1234567890abcdef1234567890abcdef12345678'
    const { container } = render(<AddressText address={evm} />)
    expect(screen.getByTitle(evm)).toHaveTextContent('0x1234...5678')
    expect(Array.from(container.querySelectorAll('strong')).map((n) => n.textContent)).toEqual(['1234', '5678'])
  })

  it('renders a string it cannot split unchanged', () => {
    render(<AddressText address="0x1234" />)
    expect(screen.getByText('0x1234')).toBeInTheDocument()
  })
})
