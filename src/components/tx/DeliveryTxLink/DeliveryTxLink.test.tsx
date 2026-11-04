// ABOUTME: Tests for DeliveryTxLink — renders "View delivery on {chain}" as an external link to the destination
// ABOUTME: (CCTP mint) tx, and nothing when there's no link.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeliveryTxLink } from './DeliveryTxLink'

describe('<DeliveryTxLink>', () => {
  it('links to the destination tx, opening in a new tab', () => {
    render(<DeliveryTxLink link={{ url: 'https://sepolia.basescan.org/tx/0xab', chainName: 'Base Sepolia' }} />)
    const a = screen.getByRole('link', { name: /View delivery on Base Sepolia/ })
    expect(a).toHaveAttribute('href', 'https://sepolia.basescan.org/tx/0xab')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders nothing without a link', () => {
    const { container } = render(<DeliveryTxLink link={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
