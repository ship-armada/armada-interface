// ABOUTME: Tests for RollingBalanceValue's fromValue roll — padding columns fold instead of showing
// ABOUTME: zeros, and onRollEnd fires only once the last staggered column has landed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { RollingBalanceValue } from './RollingBalanceValue'

const originalMatchMedia = window.matchMedia

/** Timers the odometer uses: its two-frame kick-off (rAF) and its settle timer (setTimeout). */
const ROLL_TIMERS = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] as const

/**
 * Run the two-frame kick-off in its own act() so the roll's effects (which schedule the settle
 * timer) flush at that point, as they would in a browser — act() defers effects to its end.
 */
function kickOffRoll() {
  act(() => {
    vi.advanceTimersByTime(50)
  })
}

/** Report non-reduced motion (setup defaults to reduced) so the odometer actually rolls. */
beforeEach(() => {
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
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function columns(container: HTMLElement): HTMLElement[] {
  const root = container.firstElementChild as HTMLElement
  return Array.from(root.children) as HTMLElement[]
}

function shownCount(container: HTMLElement): number {
  return columns(container).filter((column) => !column.className.includes('collapsed')).length
}

/** Wait for the two-frame kick-off that flips the odometer from its start state to its end state. */
async function waitForRollToStart(container: HTMLElement) {
  await waitFor(() =>
    expect(container.querySelector('[class*="digitTrackRoll"]')).not.toBeNull(),
  )
}

describe('RollingBalanceValue — fromValue alignment padding', () => {
  it('starts as the old value and ends as the new one when the amount shrinks (10.5 → 5)', async () => {
    const { container } = render(
      <RollingBalanceValue value="5" fromValue="10.5" mode="fromValue" rollTrigger={1} rollStartMs={0} />,
    )
    // The padded row is "05.0"; before the roll every column is part of "10.5".
    expect(columns(container)).toHaveLength(4)
    expect(shownCount(container)).toBe(4)

    await waitForRollToStart(container)
    // Once rolling, the leading 0, the point and the trailing 0 are padding for "5" — they fold away.
    expect(shownCount(container)).toBe(1)
  })

  it('hides the padding zero at the start when the amount grows (1.74 → 20)', async () => {
    const { container } = render(
      <RollingBalanceValue value="20" fromValue="1.74" mode="fromValue" rollTrigger={1} rollStartMs={0} />,
    )
    // Padded row "01.74" → "20.00": the leading column is padding for "1.74", so it starts collapsed
    // and the row reads as the four characters of "1.74", not "01.74".
    expect(columns(container)).toHaveLength(5)
    expect(columns(container)[0]?.className).toContain('collapsed')
    expect(shownCount(container)).toBe(4)

    await waitForRollToStart(container)
    // "20" has no fraction, so the point and both fraction columns fold away; the leading column opens.
    expect(columns(container)[0]?.className).not.toContain('collapsed')
    expect(shownCount(container)).toBe(2)
  })

  it('folds away a thousands comma whose left-hand digit is padding (1,000 → 5)', async () => {
    const { container } = render(
      <RollingBalanceValue value="5" fromValue="1,000" mode="fromValue" rollTrigger={1} rollStartMs={0} />,
    )
    expect(shownCount(container)).toBe(5)

    await waitForRollToStart(container)
    const comma = columns(container).find((column) => column.textContent === ',')
    expect(comma?.className).toContain('collapsed')
    expect(shownCount(container)).toBe(1)
  })

  it('keeps an exiting column until its roll is ending, and opens an entering column at once', async () => {
    const { container } = render(
      <RollingBalanceValue
        value="20"
        fromValue="1.74"
        mode="fromValue"
        rollTrigger={1}
        rollStartMs={0}
        rollDurationMs={1000}
        digitStaggerMs={70}
      />,
    )
    await waitForRollToStart(container)
    const [entering, , point, firstFraction] = columns(container)
    expect(entering?.style.transitionDelay).toBe('')
    // The point sits before fraction column 2 and the first fraction digit is column 2: both finish
    // folding as that column's roll lands (1000ms roll + 2 × 70ms stagger − 450ms fold = 690ms).
    expect(point?.style.transitionDelay).toBe('690ms')
    expect(firstFraction?.style.transitionDelay).toBe('690ms')
  })

  it('leaves columns that belong to both values alone (no collapse, no fold transition)', async () => {
    const { container } = render(
      <RollingBalanceValue value="2.5" fromValue="7.5" mode="fromValue" rollTrigger={1} rollStartMs={0} />,
    )
    await waitForRollToStart(container)
    expect(shownCount(container)).toBe(3)
    expect(container.querySelector('[class*="paddingFold"]')).toBeNull()
  })
})

describe('RollingBalanceValue — fromZero reveal', () => {
  it('never collapses or adds the fold transition (the dashboard balance reveal is unchanged)', async () => {
    const { container } = render(<RollingBalanceValue value="1,234.56" rollStartMs={0} />)
    await waitForRollToStart(container)
    expect(shownCount(container)).toBe(columns(container).length)
    expect(container.querySelector('[class*="paddingFold"]')).toBeNull()
  })
})

describe('RollingBalanceValue — onRollEnd', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports the end of a fromValue roll only once its last staggered column has landed', () => {
    vi.useFakeTimers({ toFake: [...ROLL_TIMERS] })
    const onRollEnd = vi.fn()
    render(
      <RollingBalanceValue
        value="10"
        fromValue="1.123456"
        mode="fromValue"
        rollTrigger={1}
        rollStartMs={0}
        rollDurationMs={1000}
        digitStaggerMs={70}
        onRollEnd={onRollEnd}
      />,
    )
    // The padded row "10.000000" has 8 columns: the last starts 7 × 70ms in and rolls for 1000ms,
    // plus a one-frame settle buffer → 1570ms. Counting only "10"'s two digits would end at 1150ms.
    kickOffRoll()
    act(() => {
      vi.advanceTimersByTime(1450)
    })
    expect(onRollEnd).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onRollEnd).toHaveBeenCalledTimes(1)
  })

  it('does not restart the roll when the parent re-renders with a new callback', () => {
    vi.useFakeTimers({ toFake: [...ROLL_TIMERS] })
    const first = vi.fn()
    const second = vi.fn()
    const props = {
      value: '5',
      fromValue: '7',
      mode: 'fromValue' as const,
      rollTrigger: 1,
      rollStartMs: 0,
      rollDurationMs: 1000,
      digitStaggerMs: 70,
    }
    const { rerender } = render(<RollingBalanceValue {...props} onRollEnd={first} />)
    kickOffRoll()
    act(() => {
      vi.advanceTimersByTime(550)
    })
    rerender(<RollingBalanceValue {...props} onRollEnd={second} />)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    // One column: 1000ms + 80ms buffer from the original start, reported to the latest callback.
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('reports the end straight away under reduced motion (nothing rolls)', () => {
    window.matchMedia = ((query: string) =>
      ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia
    const onRollEnd = vi.fn()
    render(<RollingBalanceValue value="5" fromValue="7" mode="fromValue" rollTrigger={1} onRollEnd={onRollEnd} />)
    expect(onRollEnd).toHaveBeenCalledTimes(1)
  })
})
