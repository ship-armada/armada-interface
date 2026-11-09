// ABOUTME: Tests for usePrefetchSdk — loads the SDK in the background once the app shell is up: not before; on idle where the
// ABOUTME: browser supports it, else after a short delay; and not if the app unmounts first.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

const prefetchSdk = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shielded/sdk-loader', () => ({ prefetchSdk }))

import { usePrefetchSdk, PREFETCH_FALLBACK_MS } from './usePrefetchSdk'

// The hook reads `window.requestIdleCallback`; jsdom's window carries its own, so stub it there (and put it back).
const original = { request: window.requestIdleCallback, cancel: window.cancelIdleCallback }
function setIdle(request: typeof window.requestIdleCallback | undefined, cancel?: typeof window.cancelIdleCallback) {
  Object.defineProperty(window, 'requestIdleCallback', { value: request, configurable: true, writable: true })
  Object.defineProperty(window, 'cancelIdleCallback', { value: cancel ?? (() => {}), configurable: true, writable: true })
}

beforeEach(() => prefetchSdk.mockClear())
afterEach(() => {
  cleanup() // unmount while the stubs are still in place
  vi.useRealTimers()
  setIdle(original.request, original.cancel)
})

describe('usePrefetchSdk', () => {
  it('waits for the app shell — no prefetch while startup is still running', () => {
    let idle: (() => void) | undefined
    setIdle(((cb: IdleRequestCallback) => { idle = () => cb({} as IdleDeadline); return 1 }) as typeof window.requestIdleCallback)
    const { rerender } = renderHook(({ ready }) => usePrefetchSdk(ready), { initialProps: { ready: false } })
    expect(idle).toBeUndefined()
    rerender({ ready: true })
    idle?.()
    expect(prefetchSdk).toHaveBeenCalledTimes(1)
  })

  it('prefetches when the browser is idle', () => {
    let idle: (() => void) | undefined
    setIdle(((cb: IdleRequestCallback) => { idle = () => cb({} as IdleDeadline); return 1 }) as typeof window.requestIdleCallback)
    renderHook(() => usePrefetchSdk(true))
    expect(prefetchSdk).not.toHaveBeenCalled()
    idle?.()
    expect(prefetchSdk).toHaveBeenCalledTimes(1)
  })

  it('falls back to a short delay where there is no idle callback (Safari)', () => {
    // Fake only the timeout: vitest's fake timers would otherwise install their own requestIdleCallback.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setIdle(undefined)
    renderHook(() => usePrefetchSdk(true))
    vi.advanceTimersByTime(PREFETCH_FALLBACK_MS - 1)
    expect(prefetchSdk).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(prefetchSdk).toHaveBeenCalledTimes(1)
  })

  it("doesn't prefetch if unmounted first", () => {
    // Fake only the timeout: vitest's fake timers would otherwise install their own requestIdleCallback.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setIdle(undefined)
    const { unmount } = renderHook(() => usePrefetchSdk(true))
    unmount()
    vi.advanceTimersByTime(PREFETCH_FALLBACK_MS)
    expect(prefetchSdk).not.toHaveBeenCalled()
  })
})
