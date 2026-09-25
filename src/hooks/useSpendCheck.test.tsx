// ABOUTME: Tests for useSpendCheck — plans an unsplittable spend (unshield / vault op) without proving: its fee as
// ABOUTME: the plan charges it, fragmentation (with the merge-notes remedy), the planner's reason, and submit re-pricing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { InsufficientBalanceError, UnsupportedCircuitShapeError } from '@armada/sdk'
import { withTestQueryClient } from '@/test-utils/queryClient'

const hoisted = vi.hoisted(() => ({ checkSpendPlans: vi.fn(), mergeTokenAddress: vi.fn(), maxUnshieldAmount: vi.fn() }))
vi.mock('@/lib/shielded/consolidate-sdk', () => ({ checkSpendPlans: hoisted.checkSpendPlans }))
vi.mock('@/lib/shielded/sdk-read', () => ({ mergeTokenAddress: hoisted.mergeTokenAddress }))
vi.mock('@/lib/shielded/unshield-sdk', () => ({ maxUnshieldAmount: hoisted.maxUnshieldAmount }))

import { useSpendCheck, type UseSpendCheckArgs } from './useSpendCheck'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const SPEND = { kind: 'unshield-local' as const, amount: 16_000_000n, perProofFee: 1_500_000n }
const INERT = { fee: null, error: null, remedy: null, pending: false, blockReason: null }
const wrapper = ({ children }: { children: ReactNode }) => withTestQueryClient(children)
function renderCheck(overrides: Partial<UseSpendCheckArgs> = {}) {
  const args: UseSpendCheckArgs = { enabled: true, spend: SPEND, token: 'usdc', balanceKey: '1', ...overrides }
  return renderHook((props: UseSpendCheckArgs) => useSpendCheck(props), { wrapper, initialProps: args })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.mergeTokenAddress.mockResolvedValue(USDC)
  hoisted.checkSpendPlans.mockResolvedValue({ totalFee: 1_500_000n })
  hoisted.maxUnshieldAmount.mockResolvedValue(5_832_098n)
})

describe('useSpendCheck', () => {
  it('dry-runs the spend in the token it spends, reproducing its shape, and reports the fee it plans', async () => {
    // The plan charges more than the per-proof quote: small change folded into the fee.
    hoisted.checkSpendPlans.mockResolvedValue({ totalFee: 1_527_000n })
    const { result } = renderCheck()
    await waitFor(() => expect(result.current).toMatchObject({ ...INERT, fee: 1_527_000n }))
    const request = hoisted.checkSpendPlans.mock.calls[0]![0] as {
      tokenAddress: string
      unshield: { amount: bigint }
      fee: { schedule: { transfer: string } }
    }
    expect(request.tokenAddress).toBe(USDC)
    expect(request.unshield.amount).toBe(16_000_000n)
    expect(request.fee.schedule.transfer).toBe('1500000')
  })

  it('is pending (no fee yet) while the check runs, so the review can hold Confirm', async () => {
    let finish: (v: { totalFee: bigint }) => void = () => {}
    hoisted.checkSpendPlans.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { result } = renderCheck()
    expect(result.current.pending).toBe(true)
    expect(result.current.fee).toBeNull()
    expect(result.current.blockReason).toBe('Checking your notes…')
    await waitFor(() => expect(hoisted.checkSpendPlans).toHaveBeenCalled())
    act(() => finish({ totalFee: 1_500_000n }))
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.fee).toBe(1_500_000n)
  })

  it('flags a spend the wallet is too fragmented for, with the merge-notes remedy', async () => {
    hoisted.checkSpendPlans.mockRejectedValue(new UnsupportedCircuitShapeError('5x3'))
    const { result } = renderCheck()
    await waitFor(() => expect(result.current.remedy).toBe('merge-notes'))
    expect(result.current.error).toMatch(/merge your notes/i)
    // The review shows the merge callout for this; the plain blocked notice stays for other reasons.
    expect(result.current.blockReason).toBeNull()
    expect(result.current.fee).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('holds Confirm with the planner\'s reason when the spend can\'t be made otherwise, as a private send does', async () => {
    hoisted.checkSpendPlans.mockRejectedValue(new InsufficientBalanceError('no single tree covers it'))
    const { result } = renderCheck()
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.blockReason).toBe(result.current.error)
    expect(result.current.remedy).toBeNull()
    expect(result.current.fee).toBeNull()
  })

  it('checks only the amount the user settles on (debounced), pending until then', async () => {
    const { result, rerender } = renderCheck({ spend: { ...SPEND, amount: 1_000_000n } })
    rerender({ enabled: true, spend: { ...SPEND, amount: 12_000_000n }, token: 'usdc', balanceKey: '1' })
    rerender({ enabled: true, spend: { ...SPEND, amount: 123_000_000n }, token: 'usdc', balanceKey: '1' })
    expect(result.current.pending).toBe(true)
    await waitFor(() => expect(result.current.fee).toBe(1_500_000n))
    // The keystroke in between is never planned; the amount it settles on is.
    const amounts = hoisted.checkSpendPlans.mock.calls.map((c) => (c[0] as { unshield: { amount: bigint } }).unshield.amount)
    expect(amounts).not.toContain(12_000_000n)
    expect(amounts.at(-1)).toBe(123_000_000n)
  })

  it('re-prices the spend at a fresh per-proof fee (submit time)', async () => {
    const { result } = renderCheck()
    await waitFor(() => expect(result.current.fee).toBe(1_500_000n))
    hoisted.checkSpendPlans.mockResolvedValue({ totalFee: 1_627_000n })
    await expect(result.current.priceAt(1_600_000n)).resolves.toBe(1_627_000n)
    const request = hoisted.checkSpendPlans.mock.calls.at(-1)![0] as { fee: { schedule: { transfer: string } } }
    expect(request.fee.schedule.transfer).toBe('1600000')
  })

  it('offers the SDK\'s unshield max (one proof, one tree) at the per-proof fee, even before an amount is typed', async () => {
    const { result } = renderCheck({ spend: { ...SPEND, amount: 0n } })
    await waitFor(() => expect(result.current.maxInput).toBe(5_832_098n))
    expect(hoisted.maxUnshieldAmount).toHaveBeenCalledWith({ perProofFee: 1_500_000n })
  })

  it('has no max for a vault withdrawal (it spends shares; its Max is the vault balance)', async () => {
    const { result } = renderCheck({ spend: { kind: 'yield-withdraw', amount: 1_000n, perProofFee: 0n }, token: 'shares' })
    await waitFor(() => expect(hoisted.checkSpendPlans).toHaveBeenCalled())
    expect(result.current.maxInput).toBeNull()
    expect(hoisted.maxUnshieldAmount).not.toHaveBeenCalled()
  })

  it('does nothing while disabled, without a spend, or for a zero amount', async () => {
    for (const overrides of [{ enabled: false }, { spend: null }, { spend: { ...SPEND, amount: 0n } }]) {
      const { result } = renderCheck(overrides)
      expect(result.current).toMatchObject(INERT)
    }
    await new Promise((r) => setTimeout(r, 400))
    expect(hoisted.checkSpendPlans).not.toHaveBeenCalled()
    // Max is still worked out at a zero amount (the Max button comes before typing), but not while disabled.
    expect(hoisted.maxUnshieldAmount).toHaveBeenCalledTimes(1)
  })
})
