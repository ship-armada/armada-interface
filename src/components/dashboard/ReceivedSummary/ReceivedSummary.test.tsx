// ABOUTME: Tests for ReceivedSummary — the received payment's table: the disclosed sender (shortened, with a copy
// ABOUTME: button for the full address) and the memo; rows hide when the sender or memo is absent.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ReceivedSummary } from './ReceivedSummary'

const SENDER = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<ReceivedSummary>', () => {
  it('lets the user copy the FULL sender address', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ReceivedSummary senderShieldedAddress={SENDER} memoText="Rent for May" />)
    expect(screen.getByText('Rent for May')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy sender address' }))
    })
    expect(writeText).toHaveBeenCalledWith(SENDER)
  })

  it('hides the From row when the sender did not disclose their address', () => {
    render(<ReceivedSummary memoText="Rent for May" />)
    expect(screen.queryByText('From')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy sender address' })).toBeNull()
  })
})
