// ABOUTME: Tests for PendingTxPill — the header's pending pill: hidden when idle, the one tx by name (or the count), an
// ABOUTME: announced tx notice, what a click opens, and the unfold / crossfade / fold motion (skipped under reduced motion).

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

  it('unfolds from the icon circle when it appears', () => {
    const { container, rerender } = render(<PendingTxPill count={0} onOpen={vi.fn()} />)
    expect(shell(container)).toBeNull()
    rerender(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
    expect(shell(container)).toHaveAttribute('data-phase', 'circle')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.unfold))
    expect(shell(container)).toHaveAttribute('data-phase', 'open')
  })

  it('crossfades between states: the old content fades out over the new', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Shielding 5.00 USDC…" onOpen={vi.fn()} />)
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.unfold))
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

  it('folds back to the circle, then vanishes, when there is nothing left to show', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Sending 5.00 USDC…" onOpen={vi.fn()} />)
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.unfold))
    rerender(<PendingTxPill count={0} onOpen={vi.fn()} />)
    expect(shell(container)).toHaveAttribute('data-phase', 'closing')
    expect(shell(container)).toHaveTextContent('Sending 5.00 USDC…')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.fold))
    expect(shell(container)).toHaveAttribute('data-phase', 'vanishing')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.vanish))
    expect(shell(container)).toBeNull()
  })

  it('reopens instead of vanishing when something new arrives mid-fold', () => {
    const { container, rerender } = render(<PendingTxPill count={1} pendingLabel="Sending 5.00 USDC…" onOpen={vi.fn()} />)
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.unfold))
    rerender(<PendingTxPill count={0} onOpen={vi.fn()} />)
    rerender(<PendingTxPill count={2} onOpen={vi.fn()} />)
    expect(shell(container)).toHaveAttribute('data-phase', 'open')
    act(() => vi.advanceTimersByTime(PILL_MOTION_MS.fold + PILL_MOTION_MS.vanish))
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

