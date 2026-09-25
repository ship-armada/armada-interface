// ABOUTME: Tests for useTransferFeePlan — review-time pricing of a private send: the split-aware total fee,
// ABOUTME: the fee-aware Max, friendly planner errors, the pending gate, and submit-time re-pricing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TooFragmentedError } from '@armada/sdk'
import { withTestQueryClient } from '@/test-utils/queryClient'
import type { FeeSchedule } from '@/lib/relayer'

const hoisted = vi.hoisted(() => ({ planTransferFee: vi.fn(), maxTransferAmount: vi.fn() }))
vi.mock('@/lib/shielded/transfer-sdk', () => ({
  planTransferFee: hoisted.planTransferFee,
  maxTransferAmount: hoisted.maxTransferAmount,
}))

import { useTransferFeePlan, type UseTransferFeePlanArgs } from './useTransferFeePlan'

const QUOTE = {
  cacheId: 'c',
  expiresAt: 0,
  chainId: 31337,
  broadcasterShieldedAddress: '0zk_relayer',
  fees: { transfer: '20000', unshield: '0', crossContract: '0', crossChainShield: '0', crossChainUnshield: '0', shield: '0', shieldXchain: '0' },
} as FeeSchedule

const wrapper = ({ children }: { children: ReactNode }) => withTestQueryClient(children)

function renderPlan(overrides: Partial<UseTransferFeePlanArgs> = {}) {
  const args: UseTransferFeePlanArgs = {
    enabled: true, recipient: '0zk_bob', amount: 1_000_000n, quote: QUOTE, balance: 5_000_000n, ...overrides,
  }
  return renderHook((props: UseTransferFeePlanArgs) => useTransferFeePlan(props), { wrapper, initialProps: args })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.planTransferFee.mockResolvedValue({ totalFee: 40_000n, proofs: 2 })
  hoisted.maxTransferAmount.mockResolvedValue(4_960_000n)
})

describe('useTransferFeePlan', () => {
  it('prices the amount at the quote\'s per-proof fee and reports the split total', async () => {
    const { result } = renderPlan()
    expect(result.current.pending).toBe(true)
    await waitFor(() => expect(result.current.fee).toBe(40_000n))
    expect(result.current.proofs).toBe(2)
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(hoisted.planTransferFee).toHaveBeenCalledWith({
      recipient: '0zk_bob',
      amount: 1_000_000n,
      broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
    })
  })

  it('computes the fee-aware Max from the balance', async () => {
    const { result } = renderPlan()
    await waitFor(() => expect(result.current.maxInput).toBe(4_960_000n))
    expect(hoisted.maxTransferAmount).toHaveBeenCalledWith({
      recipient: '0zk_bob',
      balance: 5_000_000n,
      broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
    })
  })

  it('surfaces a planner error as friendly copy and leaves the fee unknown', async () => {
    hoisted.planTransferFee.mockRejectedValue(new TooFragmentedError('needs 40 notes'))
    const { result } = renderPlan()
    await waitFor(() => expect(result.current.error).toMatch(/merge your notes/i))
    // Too fragmented is fixable in-app: review offers "Merge notes".
    expect(result.current.remedy).toBe('merge-notes')
    expect(result.current.fee).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('leaves Max unknown (caller falls back) when the full balance can\'t be planned', async () => {
    hoisted.maxTransferAmount.mockRejectedValue(new TooFragmentedError('needs 40 notes'))
    const { result } = renderPlan()
    await waitFor(() => expect(result.current.fee).toBe(40_000n))
    expect(result.current.maxInput).toBeNull()
  })

  it('does nothing while disabled, without a quote, or for a zero amount', async () => {
    for (const overrides of [{ enabled: false }, { quote: null }, { amount: 0n }]) {
      const { result } = renderPlan(overrides)
      expect(result.current.pending).toBe(false)
      expect(result.current.fee).toBeNull()
    }
    await new Promise((r) => setTimeout(r, 400))
    expect(hoisted.planTransferFee).not.toHaveBeenCalled()
  })

  it('re-prices at a fresh quote on demand (submit time)', async () => {
    const { result } = renderPlan()
    await waitFor(() => expect(result.current.fee).toBe(40_000n))
    hoisted.planTransferFee.mockResolvedValue({ totalFee: 60_000n, proofs: 2 })
    const fresh = { ...QUOTE, fees: { ...QUOTE.fees, transfer: '30000' } } as FeeSchedule
    await expect(result.current.priceAt(fresh)).resolves.toBe(60_000n)
    expect(hoisted.planTransferFee).toHaveBeenLastCalledWith({
      recipient: '0zk_bob',
      amount: 1_000_000n,
      broadcasterFee: { amount: 30_000n, recipientAddress: '0zk_relayer' },
    })
  })
})
