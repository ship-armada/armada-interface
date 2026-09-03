// ABOUTME: Tests for useRelayerHealth — retry hardening so a brief blip doesn't trip isDegraded, plus the definitive degraded / unreachable / healthy states.
// ABOUTME: Spies on fetchHealth to drive per-poll retry behaviour under fake timers.

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

  it('rides out a brief blip: two failed attempts then success is NOT degraded', async () => {
    // WHY: the core fix. A dip that fails the first two attempts but recovers on the third must
    // NOT surface the "can't find a relayer" banner. Under the old retry:1 (2 attempts) this
    // dip exhausted retries and tripped isDegraded — the fickleness the user reported.
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
      expect(results.at(-1)?.isDegraded).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flags degraded once every retry of a poll fails (sustained outage)', async () => {
    // WHY: retries smooth blips, they must not MASK a real outage. When all attempts fail the
    // poll settles to error and isDegraded surfaces within the one poll.
    vi.spyOn(relayer, 'fetchHealth').mockRejectedValue(new Error('down'))

    const { results } = renderHarness()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
      expect(results.at(-1)?.isDegraded).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a `stale` self-report as degraded immediately (no retry smoothing)', async () => {
    // WHY: a 200/503 self-report is a definitive answer from the relayer, not a transport blip —
    // no retry threshold applies. It flips isDegraded on the first successful poll.
    vi.spyOn(relayer, 'fetchHealth').mockResolvedValue(makeHealth('stale'))

    const { results } = renderHarness()

    await waitFor(() => expect(results.at(-1)?.data?.status).toBe('stale'))
    expect(results.at(-1)?.isDegraded).toBe(true)
  })

  it('is not degraded when the relayer reports healthy', async () => {
    vi.spyOn(relayer, 'fetchHealth').mockResolvedValue(makeHealth('healthy'))

    const { results } = renderHarness()

    await waitFor(() => expect(results.at(-1)?.data?.status).toBe('healthy'))
    expect(results.at(-1)?.isDegraded).toBe(false)
  })
})
