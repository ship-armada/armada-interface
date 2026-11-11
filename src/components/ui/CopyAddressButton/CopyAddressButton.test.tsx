// ABOUTME: Tests for CopyAddressButton — the icon button that copies a FULL address and briefly confirms,
// ABOUTME: with an accessible name the caller can set when a view has more than one address to copy.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CopyAddressButton } from './CopyAddressButton'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<CopyAddressButton>', () => {
  it('copies the full address and confirms', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<CopyAddressButton address={ZK} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    })
    expect(writeText).toHaveBeenCalledWith(ZK)
    expect(screen.getByRole('button', { name: 'Address copied' })).toBeInTheDocument()
  })

})
