// ABOUTME: Tests for useCopyToClipboard — writes the text, flips `copied` for the reset window, clears the timer on
// ABOUTME: unmount, and reports false (copied stays false) when the clipboard write is refused.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCopyToClipboard } from './useCopyToClipboard'

afterEach(() => {
  vi.useRealTimers()
})

describe('useCopyToClipboard', () => {
  it('copies the text and shows "copied" for the reset window', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const { result } = renderHook(() => useCopyToClipboard(2000))

    let ok = false
    await act(async () => {
      ok = await result.current.copy('0zk1abc')
    })
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('0zk1abc')
    expect(result.current.copied).toBe(true)

    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.copied).toBe(false)
  })

  it('reports false and stays un-copied when the clipboard write is refused', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) } })
    const { result } = renderHook(() => useCopyToClipboard())
    let ok = true
    await act(async () => {
      ok = await result.current.copy('x')
    })
    expect(ok).toBe(false)
    expect(result.current.copied).toBe(false)
  })
})
