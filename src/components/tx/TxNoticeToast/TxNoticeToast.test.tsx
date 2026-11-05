// ABOUTME: Tests for TxNoticeToast — a tx notice as a floating toast: tone icon + title, and an action that opens the
// ABOUTME: tx's receipt ("View", or "View details" when something went wrong).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TxNoticeToast } from './TxNoticeToast'

describe('<TxNoticeToast>', () => {
  it('shows the title and opens the receipt from "View"', () => {
    const onView = vi.fn()
    render(<TxNoticeToast tone="success" title="Sent 5.00 USDC" onView={onView} />)
    expect(screen.getByRole('status')).toHaveTextContent('Sent 5.00 USDC')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(onView).toHaveBeenCalledOnce()
  })

  it.each(['failure', 'uncertain'] as const)('offers "View details" for a %s', (tone) => {
    render(<TxNoticeToast tone={tone} title="Send failed" onView={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument()
  })
})
