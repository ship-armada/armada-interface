// ABOUTME: Tests for PendingTxPill — the header's "N Pending" pill beside the wallet button: hidden when nothing is in
// ABOUTME: flight, a spinner + count otherwise, and a button that opens the activity.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PendingTxPill } from './PendingTxPill'

describe('<PendingTxPill>', () => {
  it('renders nothing when no tx is pending', () => {
    const { container } = render(<PendingTxPill count={0} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the count and opens the activity on click', () => {
    const onOpen = vi.fn()
    render(<PendingTxPill count={2} onOpen={onOpen} />)
    const pill = screen.getByRole('button', { name: '2 transactions pending — view activity' })
    expect(pill).toHaveTextContent('2 Pending')
    fireEvent.click(pill)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('names a single pending tx in the singular', () => {
    render(<PendingTxPill count={1} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: '1 transaction pending — view activity' })).toHaveTextContent('1 Pending')
  })
})
