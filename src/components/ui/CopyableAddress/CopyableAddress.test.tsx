// ABOUTME: Tests for CopyableAddress — the shortened address (full one in the title) with a copy button beside it
// ABOUTME: that copies the FULL address; the copy button's accessible names pass through.

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
})
