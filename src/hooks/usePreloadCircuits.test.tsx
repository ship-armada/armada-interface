// ABOUTME: Tests for usePreloadCircuits — the common circuits start downloading once the wallet is signed in, not before,
// ABOUTME: and a failed preload is reported rather than thrown.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const preloadArtifactsFromOrigin = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shielded/artifacts', () => ({ preloadArtifactsFromOrigin }))
const trackError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/telemetry', () => ({ trackError }))

import { usePreloadCircuits } from './usePreloadCircuits'

beforeEach(() => {
  preloadArtifactsFromOrigin.mockReset()
  preloadArtifactsFromOrigin.mockResolvedValue(undefined)
  trackError.mockReset()
})

describe('usePreloadCircuits', () => {
  it('downloads nothing while locked — a visitor who never signs in pays nothing', () => {
    renderHook(() => usePreloadCircuits(false))
    expect(preloadArtifactsFromOrigin).not.toHaveBeenCalled()
  })

  it('starts the preload once the wallet unlocks, and not again on re-render', () => {
    const { rerender } = renderHook(({ unlocked }) => usePreloadCircuits(unlocked), { initialProps: { unlocked: false } })
    rerender({ unlocked: true })
    rerender({ unlocked: true })
    expect(preloadArtifactsFromOrigin).toHaveBeenCalledTimes(1)
  })

  it('reports a failed preload instead of throwing', async () => {
    const err = new Error('boom')
    preloadArtifactsFromOrigin.mockRejectedValue(err)
    renderHook(() => usePreloadCircuits(true))
    await waitFor(() => expect(trackError).toHaveBeenCalledWith('shielded.artifacts.preload', err))
  })
})
