// ABOUTME: Tests for AddressText — a counterparty address shown as a muted fixed prefix + the head/tail in regular weight,
// ABOUTME: with the full address in its title; strings it can't split render unchanged.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddressText } from './AddressText'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<AddressText>', () => {
  it('shows the fixed prefix, then the 8-character head and 6-character tail, without bold', () => {
    const { container } = render(<AddressText address={ZK} />)
    expect(screen.getByTitle(ZK)).toHaveTextContent('0zk1qyk9nn28...9wnce0')
    expect(container.querySelector('strong, b')).toBeNull()
  })

  it('shows a 0x address as "0x" + 4 + "..." + 4, without bold', () => {
    const evm = '0x1234567890abcdef1234567890abcdef12345678'
    const { container } = render(<AddressText address={evm} />)
    expect(screen.getByTitle(evm)).toHaveTextContent('0x1234...5678')
    expect(container.querySelector('strong, b')).toBeNull()
  })

  it('renders a string it cannot split unchanged', () => {
    render(<AddressText address="0x1234" />)
    expect(screen.getByText('0x1234')).toBeInTheDocument()
  })
})
