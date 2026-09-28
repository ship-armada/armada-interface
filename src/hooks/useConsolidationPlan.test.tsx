// ABOUTME: Tests for useConsolidationPlan — review-time pricing of a note merge: the fee + notes in → out, whether
// ABOUTME: the blocked spend works afterwards, friendly errors, the pending gate, and submit-time re-pricing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { NothingToConsolidateError } from '@armada/sdk'
import { withTestQueryClient } from '@/test-utils/queryClient'
import type { FeeSchedule } from '@/lib/relayer'

const hoisted = vi.hoisted(() => ({ previewConsolidation: vi.fn(), mergeTokenAddress: vi.fn() }))
vi.mock('@/lib/shielded/consolidate-sdk', () => ({ previewConsolidation: hoisted.previewConsolidation }))
vi.mock('@/lib/shielded/sdk-read', () => ({ mergeTokenAddress: hoisted.mergeTokenAddress }))

import { useConsolidationPlan, type UseConsolidationPlanArgs } from './useConsolidationPlan'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const QUOTE = {
  cacheId: 'c', expiresAt: 0, chainId: 31337, broadcasterShieldedAddress: '0zk_relayer',
  fees: { transfer: '20000', unshield: '0', crossContract: '0', crossChainShield: '0', crossChainUnshield: '0', shield: '0', shieldXchain: '0' },
} as FeeSchedule
const PREVIEW = { totalFee: 40_000n, proofs: 2, notesMerged: 11, notesCreated: 2 }

const wrapper = ({ children }: { children: ReactNode }) => withTestQueryClient(children)
function renderPlan(overrides: Partial<UseConsolidationPlanArgs> = {}) {
  const args: UseConsolidationPlanArgs = { enabled: true, intent: { token: 'usdc' }, quote: QUOTE, balanceKey: '1', ...overrides }
  return renderHook((props: UseConsolidationPlanArgs) => useConsolidationPlan(props), { wrapper, initialProps: args })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.mergeTokenAddress.mockResolvedValue(USDC)
  hoisted.previewConsolidation.mockResolvedValue(PREVIEW)
})

describe('useConsolidationPlan', () => {
  it('prices the merge of the intent\'s token at the quote\'s per-proof fee', async () => {
    const { result } = renderPlan()
    expect(result.current.pending).toBe(true)
    await waitFor(() => expect(result.current.preview).toEqual(PREVIEW))
    expect(result.current.tokenAddress).toBe(USDC)
    expect(result.current.pending).toBe(false)
    expect(hoisted.mergeTokenAddress).toHaveBeenCalledWith('usdc')
    expect(hoisted.previewConsolidation).toHaveBeenCalledWith({
      tokenAddress: USDC,
      broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
    })
  })

  it('dry-runs the blocked spend it was opened for', async () => {
    hoisted.previewConsolidation.mockResolvedValue({ ...PREVIEW, blockedWillWork: true })
    const { result } = renderPlan({
      intent: { token: 'usdc', blocked: { kind: 'unshield-local', amount: 7n, perProofFee: 30_000n } },
    })
    await waitFor(() => expect(result.current.preview?.blockedWillWork).toBe(true))
    const { blocked } = hoisted.previewConsolidation.mock.calls[0]![0] as { blocked: { unshield: { amount: bigint } } }
    expect(blocked.unshield.amount).toBe(7n)
  })

  it('surfaces "nothing to merge" as friendly copy', async () => {
    hoisted.previewConsolidation.mockRejectedValue(new NothingToConsolidateError('nothing'))
    const { result } = renderPlan()
    await waitFor(() => expect(result.current.error).toMatch(/nothing to merge/i))
    expect(result.current.preview).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('reports a token with no deployment as an error', async () => {
    hoisted.mergeTokenAddress.mockResolvedValue(undefined)
    const { result } = renderPlan({ intent: { token: 'shares' } })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(hoisted.previewConsolidation).not.toHaveBeenCalled()
  })

  it('does nothing while disabled or without a quote', async () => {
    for (const overrides of [{ enabled: false }, { quote: null }, { intent: null }]) {
      const { result } = renderPlan(overrides)
      expect(result.current.pending).toBe(false)
      expect(result.current.preview).toBeNull()
    }
    expect(hoisted.previewConsolidation).not.toHaveBeenCalled()
  })

  it('re-prices at a fresh quote on demand (submit time)', async () => {
    const { result } = renderPlan()
    await waitFor(() => expect(result.current.preview).toEqual(PREVIEW))
    hoisted.previewConsolidation.mockResolvedValue({ ...PREVIEW, totalFee: 60_000n })
    const fresh = { ...QUOTE, fees: { ...QUOTE.fees, transfer: '30000' } } as FeeSchedule
    await expect(result.current.priceAt(fresh)).resolves.toMatchObject({ totalFee: 60_000n })
    expect(hoisted.previewConsolidation).toHaveBeenLastCalledWith({
      tokenAddress: USDC,
      broadcasterFee: { amount: 30_000n, recipientAddress: '0zk_relayer' },
    })
  })
})
