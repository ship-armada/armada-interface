// ABOUTME: Tests for BalanceSpot — the one card the sign-in, sync and balance faces share: the same element throughout, the
// ABOUTME: outgoing face kept (hidden from assistive tech) while it fades on the forward steps, instant swaps otherwise, the shared mark.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BalanceSpot, FACE_FADE_MS, type BalanceSpotFace } from './BalanceSpot'

function face(name: BalanceSpotFace) {
  return <p>{`${name} face`}</p>
}

function renderSpot(initial: BalanceSpotFace, showMark = false) {
  const view = render(<BalanceSpot face={initial} showMark={showMark}>{face(initial)}</BalanceSpot>)
  const card = view.container.firstElementChild
  const show = (next: BalanceSpotFace, mark = showMark) =>
    view.rerender(<BalanceSpot face={next} showMark={mark}>{face(next)}</BalanceSpot>)
  return { ...view, card, show }
}

/** Test setup reports reduced motion; these tests need motion on. */
function withMotion() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('<BalanceSpot>', () => {
  it('stays the same card from sign-in through sync to the balance', () => {
    const { container, card, show } = renderSpot('sign-in')
    show('sync')
    show('balance')
    expect(container.firstElementChild).toBe(card)
    expect(screen.getByText('balance face')).toBeInTheDocument()
  })

  it('on sign-in, keeps the sign-in face (hidden from assistive tech) while it fades, then drops it', () => {
    withMotion()
    vi.useFakeTimers()
    const { show } = renderSpot('sign-in')
    show('sync')
    expect(screen.getByText('sign-in face').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('sync face')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(FACE_FADE_MS))
    expect(screen.queryByText('sign-in face')).toBeNull()
  })

  it('the balance arriving fades the sync face out the same way', () => {
    withMotion()
    const { show } = renderSpot('sync')
    show('balance')
    expect(screen.getByText('sync face').parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('locking swaps straight back to the sign-in face', () => {
    withMotion()
    const { show } = renderSpot('balance')
    show('sign-in')
    expect(screen.queryByText('balance face')).toBeNull()
    expect(screen.getByText('sign-in face')).toBeInTheDocument()
  })

  it('with reduced motion, every swap is instant', () => {
    const { show } = renderSpot('sign-in')
    show('sync')
    expect(screen.queryByText('sign-in face')).toBeNull()
  })

  it('shows the shared Armada mark only when asked (sign-in and syncing), hiding it otherwise', () => {
    const { container, show } = renderSpot('sign-in', true)
    const mark = container.querySelector('[data-balance-spot-mark]')
    expect(mark).toHaveAttribute('data-shown', 'true')
    show('balance', false)
    expect(mark).toHaveAttribute('data-shown', 'false')
  })
})
