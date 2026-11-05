// ABOUTME: Tests for useNow — ticks the current time every interval while enabled, and stays put while disabled.
// ABOUTME: Fake timers drive the clock.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNow } from './useNow'

afterEach(() => {
  vi.useRealTimers()
})

describe('useNow', () => {
  it('ticks while enabled and freezes while disabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { result, rerender } = renderHook(({ enabled }) => useNow(500, enabled), { initialProps: { enabled: true } })
    expect(result.current).toBe(1_000)
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(1_500)
    rerender({ enabled: false })
    act(() => vi.advanceTimersByTime(2_000))
    expect(result.current).toBe(1_500)
  })
})
