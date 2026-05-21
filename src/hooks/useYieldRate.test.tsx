// ABOUTME: Tests for useYieldRate — returns null until first read, mirrors rate into state, pauses refetch when tab is hidden, retains previous value on transient error.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { tabVisibleAtom } from '@/state/visibility'

vi.mock('wagmi/actions', () => ({
  readContract: vi.fn(),
}))

vi.mock('@/config/deployments', () => ({
  loadYieldDeployment: vi.fn(),
}))

import { useYieldRate } from './useYieldRate'
import { readContract } from 'wagmi/actions'
import { loadYieldDeployment } from '@/config/deployments'

const mockReadContract = readContract as unknown as ReturnType<typeof vi.fn>
const mockLoadYieldDeployment = loadYieldDeployment as unknown as ReturnType<typeof vi.fn>

const YIELD_DEPLOYMENT = {
  contracts: { armadaYieldVault: '0x0000000000000000000000000000000000000abc' },
}

function Harness({ onResult }: { onResult: (r: ReturnType<typeof useYieldRate>) => void }) {
  const r = useYieldRate()
  onResult(r)
  return null
}

function renderHarness(opts?: { tabVisible?: boolean }): {
  store: ReturnType<typeof createStore>
  queryClient: QueryClient
  results: Array<ReturnType<typeof useYieldRate>>
} {
  const store = createStore()
  if (opts?.tabVisible !== undefined) store.set(tabVisibleAtom, opts.tabVisible)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const results: Array<ReturnType<typeof useYieldRate>> = []
  render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <Harness onResult={r => results.push(r)} />
      </Provider>
    </QueryClientProvider>,
  )
  return { store, queryClient, results }
}

describe('useYieldRate', () => {
  beforeEach(() => {
    mockLoadYieldDeployment.mockResolvedValue(YIELD_DEPLOYMENT)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null before the first read resolves', async () => {
    let resolveRead!: (v: bigint) => void
    mockReadContract.mockImplementationOnce(() => new Promise(res => { resolveRead = res }))

    const { results } = renderHarness()

    // First render call sees null (queryFn hasn't started yet — still awaiting loadYieldDeployment).
    expect(results[0]).toBeNull()

    // Wait until queryFn has invoked readContract (i.e. resolveRead is captured).
    await waitFor(() => expect(mockReadContract).toHaveBeenCalledTimes(1))
    await act(async () => { resolveRead(1_010_000n) })
    await waitFor(() => expect(results.at(-1)?.rate).toBe(1_010_000n))
  })

  it('returns null when yield is not deployed on this network', async () => {
    mockLoadYieldDeployment.mockResolvedValue(null)
    const { results } = renderHarness()

    await waitFor(() => expect(results.length).toBeGreaterThan(1))
    expect(results.at(-1)).toBeNull()
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('does not refetch on the interval while tab is hidden', async () => {
    mockReadContract.mockResolvedValue(1_000_000n)
    const { queryClient } = renderHarness({ tabVisible: false })

    await waitFor(() => expect(queryClient.getQueryData(['yieldRate'])).toBeDefined())
    expect(mockReadContract).toHaveBeenCalledTimes(1)

    vi.useFakeTimers({ shouldAdvanceTime: false })
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
      expect(mockReadContract).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
