// ABOUTME: Tests for useYieldRate — first-read latency, hidden-tab refetch pause, no-deployment short-circuit, refresh() bypassing the cache, net APY math.

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

const SPOKE_ADDRESS = '0x0000000000000000000000000000000000000def' as const

/**
 * Wire the per-call mocks for one happy-path queryFn invocation. The hook reads (in order):
 * vault.convertToAssets, vault.spoke, vault.reserveId, vault.yieldFeeBps, spoke.getReserveData.
 * The first four happen in Promise.all so the order within them is implementation-defined; we
 * key on `functionName` to stay robust to that.
 */
function mockSuccessfulReadOnce(opts: {
  rate?: bigint
  feeBps?: bigint
  grossAnnualBps?: bigint
}): void {
  const rate = opts.rate ?? 1_000_000n
  const feeBps = opts.feeBps ?? 1_000n // 10% default
  const grossAnnualBps = opts.grossAnnualBps ?? 500n // 5%
  mockReadContract.mockImplementation(async (_config, args: { functionName: string }) => {
    switch (args.functionName) {
      case 'convertToAssets': return rate
      case 'spoke': return SPOKE_ADDRESS
      case 'reserveId': return 0n
      case 'yieldFeeBps': return feeBps
      case 'getReserveData':
        // Tuple shape: [underlying, totalShares, totalDeposited, liquidityIndex, lastUpdate, annualYieldBps, mintableYield]
        return ['0x0', 0n, 0n, 0n, 0n, grossAnnualBps, false]
      default:
        throw new Error(`unexpected functionName ${args.functionName}`)
    }
  })
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

  it('returns rate=null before the first read resolves, then the populated snapshot', async () => {
    mockSuccessfulReadOnce({ rate: 1_010_000n, grossAnnualBps: 500n, feeBps: 1_000n })

    const { results } = renderHarness()

    // First render: rate not yet populated.
    expect(results[0]?.rate).toBeNull()

    await waitFor(() => expect(results.at(-1)?.rate?.rate).toBe(1_010_000n))
    const latest = results.at(-1)
    // Net APY = 500 bps × (10_000 - 1_000) / 10_000 = 450 bps
    expect(latest?.rate?.apyBps).toBe(450n)
  })

  it('returns rate=null when yield is not deployed on this network', async () => {
    mockLoadYieldDeployment.mockResolvedValue(null)
    const { results } = renderHarness()

    await waitFor(() => expect(results.length).toBeGreaterThan(1))
    expect(results.at(-1)?.rate).toBeNull()
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('does not refetch on the interval while tab is hidden', async () => {
    mockSuccessfulReadOnce({})
    const { queryClient } = renderHarness({ tabVisible: false })

    await waitFor(() => expect(queryClient.getQueryData(['yieldRate'])).toBeDefined())
    const initialCalls = mockReadContract.mock.calls.length

    vi.useFakeTimers({ shouldAdvanceTime: false })
    try {
      // Advance past the new 5-min poll cadence. Should produce zero new reads while hidden.
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
      expect(mockReadContract.mock.calls.length).toBe(initialCalls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refresh() pulls a fresh snapshot and seeds the query cache so other consumers see it', async () => {
    // Initial mock: 5% gross / 10% fee → 450 bps net
    mockSuccessfulReadOnce({ rate: 1_000_000n, grossAnnualBps: 500n, feeBps: 1_000n })
    const { queryClient, results } = renderHarness()
    await waitFor(() => expect(results.at(-1)?.rate).not.toBeNull())
    expect(results.at(-1)?.rate?.apyBps).toBe(450n)

    // After-refresh mock: 8% gross / 10% fee → 720 bps net (simulates rate change between polls)
    mockSuccessfulReadOnce({ rate: 1_001_000n, grossAnnualBps: 800n, feeBps: 1_000n })
    await act(async () => {
      await results.at(-1)!.refresh()
    })

    // The cache reflects the new value — a BalanceHero re-render would pick it up immediately.
    const cached = queryClient.getQueryData<{ rate: bigint; apyBps: bigint }>(['yieldRate'])
    expect(cached?.rate).toBe(1_001_000n)
    expect(cached?.apyBps).toBe(720n)
  })

  it('clamps an absurd yieldFeeBps to 10_000 so apyBps never goes negative', async () => {
    // Defensive math — if the contract is ever misconfigured to feeBps > 10_000 we want apyBps=0,
    // not a wrap-around or thrown subtraction.
    mockSuccessfulReadOnce({ grossAnnualBps: 500n, feeBps: 99_999n })
    const { results } = renderHarness()
    await waitFor(() => expect(results.at(-1)?.rate).not.toBeNull())
    expect(results.at(-1)?.rate?.apyBps).toBe(0n)
  })
})
