// ABOUTME: Tests for BalanceCard — a hidden balance never shows its figure (intro roll included), "Confirming…", and the
// ABOUTME: re-roll lifetime (the odometers stay mounted until their padded rolls settle).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { BalanceCard, type BalanceCardProps } from './BalanceCard'

const originalMatchMedia = window.matchMedia

/** Timers the odometer uses: its two-frame kick-off (rAF) and the card's settle timer (setTimeout). */
const ROLL_TIMERS = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] as const

beforeEach(() => {
  // Non-reduced motion (setup defaults to reduced) so the intro and the re-rolls actually play.
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
  vi.useFakeTimers({ toFake: [...ROLL_TIMERS] })
})

afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = originalMatchMedia
})

/** Advance in its own act() so effects scheduled along the way flush as they would in a browser. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Whether an odometer showing `value` is mounted (its root carries the value as aria-label). */
function odometerShowing(container: HTMLElement, value: string): boolean {
  return container.querySelector(`[aria-label="${value}"] [class*="digitColumn"]`) !== null
}

/** Render, let the page-load intro finish, then start a fromValue re-roll as Dashboard does. */
function startReRoll(before: BalanceCardProps, after: BalanceCardProps) {
  const { container, rerender } = render(<BalanceCard {...before} />)
  advance(1000)
  rerender(<BalanceCard {...after} balanceRollTrigger={1} balanceRollMode="fromValue" />)
  // The odometer's two-frame kick-off.
  advance(50)
  return container
}

/** Text the user can see — leaves only, minus the two invisible (visibility: hidden, aria-hidden) width-reserving copies. */
function visibleBalanceText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('*'))
    .filter((el) => el.children.length === 0 && !el.closest('[class*="balanceValueSizer"], [class*="widthAnchor"]'))
    .map((el) => el.textContent ?? '')
    .join('')
}

describe('BalanceCard — hidden balance', () => {
  it('never shows the figure while balances are hidden — not during the page-load intro roll, nor after it', () => {
    // WHY: the intro odometer rendered the real digits even with balances hidden, so the balance rolled into view on
    // every mount (sign-in → sync → balance remounts the card) before the mask took over.
    const { container, getAllByLabelText } = render(<BalanceCard balance={12.34} balanceHidden />)
    expect(getAllByLabelText('Balance hidden').length).toBeGreaterThan(0)
    expect(container.querySelector('[class*="digitColumn"]')).toBeNull()
    expect(visibleBalanceText(container)).not.toMatch(/\d/)
    advance(2000)
    expect(container.querySelector('[class*="digitColumn"]')).toBeNull()
    expect(visibleBalanceText(container)).not.toMatch(/\d/)
  })
})

describe('BalanceCard — confirming (3B)', () => {
  it('says "Confirming…" beside the label while the balance includes an unconfirmed figure, and not otherwise', () => {
    const { getByRole, rerender } = render(<BalanceCard balance={25} confirming />)
    expect(getByRole('status')).toHaveTextContent('Confirming…')
    rerender(<BalanceCard balance={25} />)
    expect(getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('BalanceCard — re-roll lifetime', () => {
  it('keeps the balance odometer until a roll to a shorter value has settled (12.345678 → 12.5)', () => {
    // "12.345678" → "12.5" rolls as 8 columns: it settles ~1.57s in. Counting only the 3 digits of
    // "12.5" would swap in the static value at ~1.22s, cutting the last columns off mid-spin.
    const container = startReRoll(
      { balance: 12.345678 },
      { balance: 12.5, balanceRollFromValue: '12.345678' },
    )
    expect(odometerShowing(container, '12.5')).toBe(true)
    advance(1250)
    expect(odometerShowing(container, '12.5')).toBe(true)
    advance(400)
    expect(odometerShowing(container, '12.5')).toBe(false)
  })

  it('keeps the vault odometer until its own padded roll has settled, even when the balance roll is shorter', () => {
    // The vault rolls "1,234.56" → "5" over 6 columns (~1.43s); the balance "10" → "10" needs ~1.15s.
    const container = startReRoll(
      { balance: 10, vaultBalance: 1234.56 },
      { balance: 10, balanceRollFromValue: '10', vaultBalance: 5, vaultRollFromValue: '1,234.56' },
    )
    expect(odometerShowing(container, '5')).toBe(true)
    advance(1250)
    expect(odometerShowing(container, '5')).toBe(true)
    advance(400)
    expect(odometerShowing(container, '5')).toBe(false)
  })
})
