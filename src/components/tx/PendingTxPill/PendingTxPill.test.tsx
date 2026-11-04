// ABOUTME: Tests for PendingTxPill — the header's "N Pending" pill beside the wallet button: hidden when nothing is in
// ABOUTME: flight, a spinner + count otherwise, a button that opens the activity, and a tx notice announced in place.

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

  it('announces a tx notice in place of the count, even once nothing is pending, and opens that tx', () => {
    const onOpen = vi.fn()
    const onAnnouncementOpen = vi.fn()
    render(
      <PendingTxPill
        count={0}
        onOpen={onOpen}
        announcement={{ tone: 'success', title: 'Sent 5.00 USDC' }}
        onAnnouncementOpen={onAnnouncementOpen}
        onAnnouncementDismiss={vi.fn()}
      />,
    )
    const pill = screen.getByRole('button', { name: 'Sent 5.00 USDC — view' })
    fireEvent.click(pill)
    expect(onAnnouncementOpen).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps a failure announcement up with "View details" and a dismiss', () => {
    const onDismiss = vi.fn()
    render(
      <PendingTxPill
        count={1}
        onOpen={vi.fn()}
        announcement={{ tone: 'failure', title: 'Send failed' }}
        onAnnouncementOpen={vi.fn()}
        onAnnouncementDismiss={onDismiss}
      />,
    )
    expect(screen.getByRole('button', { name: 'Send failed — view details' })).toHaveTextContent('View details')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
