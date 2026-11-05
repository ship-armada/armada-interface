// ABOUTME: Tests for PendingTxPill — the header's pending pill: hidden when idle, the one tx by name (or the count), an
// ABOUTME: announced tx notice, what a click opens, and the unfold / crossfade / fold motion and its sizing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PendingTxPill, PILL_MOTION_MS } from './PendingTxPill'

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

  it('shows a single pending tx by its own label, and opens its progress', () => {
    const onOpen = vi.fn()
    render(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={onOpen} />)
    const pill = screen.getByRole('button', { name: 'Shielding 5.00 USDC… — view progress' })
    expect(pill).toHaveTextContent('Shielding 5.00 USDC…')
    fireEvent.click(pill)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('falls back to the count when several are pending, even with a label', () => {
    render(<PendingTxPill count={2} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: '2 transactions pending — view activity' })).toHaveTextContent('2 Pending')
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

describe('<PendingTxPill> motion', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    vi.useFakeTimers()
    // The test setup reports reduced motion; these cases need the full motion.
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
    vi.useRealTimers()
  })

  const shell = (container: HTMLElement) => container.firstElementChild as HTMLElement | null

  it('appears in its entering style, then opens before paint (so the CSS transition runs from it)', () => {
    const { container, rerender } = render(<PendingTxPill count={0} onOpen={vi.fn()} />)
    expect(shell(container)).toBeNull()
    const observer = new MutationObserver(() => {})
    observer.observe(container, { subtree: true, attributes: true, attributeFilter: ['data-phase'], attributeOldValue: true })
    rerender(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
    const changes = observer.takeRecords().map((record) => record.oldValue)
    observer.disconnect()
    expect(changes).toContain('entering')
    expect(shell(container)).toHaveAttribute('data-phase', 'open')
  })

  it('sizes to the content\'s layout width, not its transformed on-screen box', () => {
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(152)
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 91, height: 24, top: 0, left: 0, right: 91, bottom: 24, x: 0, y: 0, toJSON() {} })
    try {
      const { container } = render(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
      expect(shell(container)?.style.width).toBe('152px')
    } finally {
      offsetWidth.mockRestore()
      rect.mockRestore()
    }
  })

  it('crossfades between states: the old content fades out over the new', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
    rerender(
      <PendingTxPill
        count={0}
        onOpen={vi.fn()}
        announcement={{ tone: 'success', title: 'Shielded 5.00 USDC' }}
        onAnnouncementOpen={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Shielded 5.00 USDC — view' })).toBeInTheDocument()
    const leaving = container.querySelector('[data-leaving]')
    expect(leaving).toHaveTextContent('Shielding 5.00 USDC…')
    expect(leaving).toHaveAttribute('aria-hidden', 'true')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.crossfade))
    expect(container.querySelector('[data-leaving]')).toBeNull()
  })

  it('folds back and fades out, in one movement, when there is nothing left to show', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Sending 5.00 USDC…" onOpen={vi.fn()} />)
    rerender(<PendingTxPill count={0} onOpen={vi.fn()} />)
    expect(shell(container)).toHaveAttribute('data-phase', 'closing')
    expect(shell(container)).toHaveTextContent('Sending 5.00 USDC…')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.close - 1))
    expect(shell(container)).toHaveAttribute('data-phase', 'closing')
    act(() => vi.advanceTimersByTime(1))
    expect(shell(container)).toBeNull()
  })

  it('starts from the entering style again on its next appearance', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Sending 5.00 USDC…" onOpen={vi.fn()} />)
    rerender(<PendingTxPill count={0} onOpen={vi.fn()} />)
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.close))
    expect(shell(container)).toBeNull()
    const observer = new MutationObserver(() => {})
    observer.observe(container, { subtree: true, attributes: true, attributeFilter: ['data-phase'], attributeOldValue: true })
    rerender(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
    const changes = observer.takeRecords().map((record) => record.oldValue)
    observer.disconnect()
    expect(changes).toEqual(['entering'])
    expect(shell(container)).toHaveAttribute('data-phase', 'open')
  })

  it('reopens instead of vanishing when something new arrives mid-fold', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Sending 5.00 USDC…" onOpen={vi.fn()} />)
    rerender(<PendingTxPill count={0} onOpen={vi.fn()} />)
    rerender(<PendingTxPill count={2} onOpen={vi.fn()} />)
    expect(shell(container)).toHaveAttribute('data-phase', 'open')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.close))
    expect(screen.getByRole('button', { name: '2 transactions pending — view activity' })).toBeInTheDocument()
  })
})

describe('<PendingTxPill> under reduced motion', () => {
  it('appears and disappears at once, with no fading copy left behind', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Sending 5.00 USDC…" onOpen={vi.fn()} />)
    expect(container.firstElementChild).toHaveAttribute('data-phase', 'open')
    rerender(<PendingTxPill count={2} onOpen={vi.fn()} />)
    expect(container.querySelector('[data-leaving]')).toBeNull()
    rerender(<PendingTxPill count={0} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

