// ABOUTME: Tests for useRelayerHealth — retry hardening so a brief blip doesn't trip isUnreachable,
// ABOUTME: plus the reachability vs indexer-freshness split (stale is NOT an availability signal).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRelayerHealth } from './useRelayerHealth'
import * as relayer from '@/lib/relayer'

function makeHealth(status: relayer.RelayerHealthStatus): relayer.RelayerHealthResponse {
  return { status, chains: [], generatedAt: Date.now() }
}

function Harness({ onResult }: { onResult: (r: ReturnType<typeof useRelayerHealth>) => void }) {
  const r = useRelayerHealth({ enabled: true })
  onResult(r)
  return null
}

function renderHarness(): {
  results: Array<ReturnType<typeof useRelayerHealth>>
  unmount: () => void
} {
  const store = createStore()
  const queryClient = new QueryClient()
  const results: Array<ReturnType<typeof useRelayerHealth>> = []
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <Harness onResult={r => results.push(r)} />
      </Provider>
    </QueryClientProvider>,
  )
  return { results, unmount }
}

describe('useRelayerHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rides out a brief blip: two failed attempts then success is NOT unreachable', async () => {
    // WHY: the retry-hardening fix. A dip that fails the first two attempts but recovers on the
    // third must NOT surface the "can't find a relayer" banner.
    const spy = vi
      .spyOn(relayer, 'fetchHealth')
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue(makeHealth('healthy'))

    const { results } = renderHarness()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      // Advance past the retry backoff (3s + 6s) so the third attempt runs.
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
      expect(spy).toHaveBeenCalledTimes(3)
      expect(results.at(-1)?.data?.status).toBe('healthy')
      expect(results.at(-1)?.isUnreachable).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flags unreachable once every retry of a poll fails (sustained outage)', async () => {
    // WHY: retries smooth blips, they must not MASK a real outage. When all attempts fail the poll
    // settles to error and isUnreachable surfaces within the one poll.
    vi.spyOn(relayer, 'fetchHealth').mockRejectedValue(new Error('down'))

    const { results } = renderHarness()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
      expect(results.at(-1)?.isUnreachable).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT treat a `stale` self-report as unreachable or indexer-stalled (routine watcher lag)', async () => {
    // WHY: the core semantic fix. `stale` is indexer freshness lag, not a relay-availability signal
    // — the relayer can still broadcast, so neither the banner nor the delivery advisory should trip.
    vi.spyOn(relayer, 'fetchHealth').mockResolvedValue(makeHealth('stale'))

    const { results } = renderHarness()

    await waitFor(() => expect(results.at(-1)?.data?.status).toBe('stale'))
    expect(results.at(-1)?.isUnreachable).toBe(false)
    expect(results.at(-1)?.isIndexerStalled).toBe(false)
  })

  it('flags indexer-stalled (not unreachable) on an `unhealthy` self-report', async () => {
    // WHY: an `unhealthy` indexer is badly behind → cross-chain delivery may lag, but broadcast is
    // still fine. So `isIndexerStalled` trips (xchain advisory) while `isUnreachable` stays false.
    vi.spyOn(relayer, 'fetchHealth').mockResolvedValue(makeHealth('unhealthy'))

    const { results } = renderHarness()

    await waitFor(() => expect(results.at(-1)?.data?.status).toBe('unhealthy'))
    expect(results.at(-1)?.isIndexerStalled).toBe(true)
    expect(results.at(-1)?.isUnreachable).toBe(false)
  })

  it('is neither unreachable nor indexer-stalled when the relayer reports healthy', async () => {
    vi.spyOn(relayer, 'fetchHealth').mockResolvedValue(makeHealth('healthy'))

    const { results } = renderHarness()

    await waitFor(() => expect(results.at(-1)?.data?.status).toBe('healthy'))
    expect(results.at(-1)?.isUnreachable).toBe(false)
    expect(results.at(-1)?.isIndexerStalled).toBe(false)
  })
})
