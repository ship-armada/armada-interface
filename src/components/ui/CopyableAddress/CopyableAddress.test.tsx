// ABOUTME: Tests for CopyableAddress — review keeps a copy icon beside the shortened address; a receipt
// ABOUTME: underlines the address, shows a Copy tooltip, and copies the FULL address from that control.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CopyableAddress } from './CopyableAddress'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<CopyableAddress>', () => {
  it('shows the shortened address and copies the full one', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<CopyableAddress address={ZK} label="Copy sender address" copiedLabel="Sender address copied" />)
    expect(screen.getByTitle(ZK)).toHaveTextContent('0zk1qyk9nn28...9wnce0')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy sender address' }))
    })
    expect(writeText).toHaveBeenCalledWith(ZK)
    expect(screen.getByRole('button', { name: 'Sender address copied' })).toBeInTheDocument()
  })

  it('on a receipt, the underlined address copies the full one and has no copy icon', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('hover'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia
    try {
      render(
        <CopyableAddress
          address={ZK}
          label="Copy sender address"
          copiedLabel="Sender address copied"
          presentation="link"
        />,
      )
      const address = screen.getByRole('button', { name: 'Copy sender address' })
      expect(address).toHaveTextContent('0zk1qyk9nn28...9wnce0')
      expect(address.querySelector('svg')).toBeNull()
      fireEvent.mouseEnter(address.parentElement as HTMLElement)
      // Floating UI never marks the tooltip positioned in jsdom, so it stays visibility:hidden.
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Copy')
      await act(async () => {
        fireEvent.click(address)
      })
      expect(writeText).toHaveBeenCalledWith(ZK)
      expect(screen.getByRole('button', { name: 'Sender address copied' })).toBeInTheDocument()
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Copied')
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})
