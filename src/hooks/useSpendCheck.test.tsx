// ABOUTME: Tests for useSpendCheck — the review-time dry run of an unsplittable spend (unshield / vault op): it
// ABOUTME: surfaces only fragmentation (with the merge-notes remedy) and never blocks on other outcomes.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { InsufficientBalanceError, UnsupportedCircuitShapeError } from '@armada/sdk'
import { withTestQueryClient } from '@/test-utils/queryClient'

const hoisted = vi.hoisted(() => ({ checkSpendPlans: vi.fn(), mergeTokenAddress: vi.fn() }))
vi.mock('@/lib/shielded/consolidate-sdk', () => ({ checkSpendPlans: hoisted.checkSpendPlans }))
vi.mock('@/lib/shielded/sdk-read', () => ({ mergeTokenAddress: hoisted.mergeTokenAddress }))

import { useSpendCheck, type UseSpendCheckArgs } from './useSpendCheck'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const SPEND = { kind: 'unshield-local' as const, amount: 16_000_000n, perProofFee: 1_500_000n }
const wrapper = ({ children }: { children: ReactNode }) => withTestQueryClient(children)
function renderCheck(overrides: Partial<UseSpendCheckArgs> = {}) {
  const args: UseSpendCheckArgs = { enabled: true, spend: SPEND, token: 'usdc', balanceKey: '1', ...overrides }
  return renderHook(() => useSpendCheck(args), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.mergeTokenAddress.mockResolvedValue(USDC)
  hoisted.checkSpendPlans.mockResolvedValue(undefined)
})

describe('useSpendCheck', () => {
  it('dry-runs the spend in the token it spends, reproducing its shape', async () => {
    const { result } = renderCheck()
    await waitFor(() => expect(hoisted.checkSpendPlans).toHaveBeenCalled())
    const request = hoisted.checkSpendPlans.mock.calls[0]![0] as { tokenAddress: string; unshield: { amount: bigint } }
    expect(request.tokenAddress).toBe(USDC)
    expect(request.unshield.amount).toBe(16_000_000n)
    await waitFor(() => expect(result.current).toEqual({ error: null, remedy: null, pending: false, blockReason: null }))
  })

  it('is pending while the check runs, so the review can hold Confirm', async () => {
    let finish: () => void = () => {}
    hoisted.checkSpendPlans.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const { result } = renderCheck()
    expect(result.current.pending).toBe(true)
    expect(result.current.blockReason).toBe('Checking your notes…')
    await waitFor(() => expect(hoisted.checkSpendPlans).toHaveBeenCalled())
    finish()
    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('flags a spend the wallet is too fragmented for, with the merge-notes remedy', async () => {
    hoisted.checkSpendPlans.mockRejectedValue(new UnsupportedCircuitShapeError('5x3'))
    const { result } = renderCheck()
    await waitFor(() => expect(result.current.remedy).toBe('merge-notes'))
    expect(result.current.error).toMatch(/merge your notes/i)
    // The review shows the merge callout for this; the plain blocked notice stays for other reasons.
    expect(result.current.blockReason).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('never blocks on other outcomes — the real build reports those', async () => {
    hoisted.checkSpendPlans.mockRejectedValue(new InsufficientBalanceError('no single tree covers it'))
    const { result } = renderCheck()
    await waitFor(() => expect(hoisted.checkSpendPlans).toHaveBeenCalled())
    await waitFor(() => expect(result.current).toEqual({ error: null, remedy: null, pending: false, blockReason: null }))
  })

  it('does nothing while disabled, without a spend, or for a zero amount', async () => {
    for (const overrides of [{ enabled: false }, { spend: null }, { spend: { ...SPEND, amount: 0n } }]) {
      const { result } = renderCheck(overrides)
      expect(result.current).toEqual({ error: null, remedy: null, pending: false, blockReason: null })
    }
    await new Promise((r) => setTimeout(r, 10))
    expect(hoisted.checkSpendPlans).not.toHaveBeenCalled()
  })
})
