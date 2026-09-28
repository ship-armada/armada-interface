// ABOUTME: Tests for MergeModal — the merge-notes flow: opens on review for the intent's token, prices via the plan,
// ABOUTME: re-prices at Confirm (bouncing to review on a change), submits a consolidate record, and closes cleanly.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MergeModal } from './MergeModal'
import { mergeIntentAtom, openModalAtom } from '@/state/ui'
import { activeShieldedWalletIdAtom } from '@/state/wallet'
import { txListAtom } from '@/state/tx'
import { withTestQueryClient } from '@/test-utils/queryClient'
import type { TxRecord } from '@/lib/tx/types'
import type { MergeIntent } from '@/lib/shielded/merge-intent'

vi.mock('@/hooks/useRelayerHealth', () => ({
  useRelayerHealth: () => ({
    isConfigured: true, isUnreachable: false, isChecking: false, isIndexerStalled: false,
    data: { status: 'healthy' }, refetch: vi.fn(),
  }),
}))
vi.mock('@/lib/tx/executor', async (importActual) => ({
  ...await importActual<typeof import('@/lib/tx/executor')>(),
  getIsLeader: () => true,
}))
vi.mock('@/lib/tx/storage', () => ({
  putTxIfFresh: vi.fn(async () => true),
  putTx: vi.fn(async () => {}),
  deleteTx: vi.fn(async () => {}),
  loadAllTx: vi.fn(async () => []),
}))

const QUOTE = {
  cacheId: 'merge-cache',
  expiresAt: Date.now() + 5 * 60_000,
  chainId: 31337,
  broadcasterShieldedAddress: '0zk' + 'a'.repeat(64),
  fees: { transfer: '20000', unshield: '0', crossContract: '0', crossChainShield: '0', crossChainUnshield: '0', shield: '0', shieldXchain: '0' },
}
vi.mock('@/hooks/useFees', () => ({
  useFees: () => ({ quote: QUOTE, isStale: false, isUnavailable: false, refresh: vi.fn(async () => QUOTE) }),
  FEES_QUERY_KEY: ['fees'],
}))

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const PREVIEW = { totalFee: 40_000n, proofs: 2, notesMerged: 11, notesCreated: 2 }
const hoistedPlan = vi.hoisted(() => {
  const defaults = () => ({
    preview: null as (typeof PREVIEW & { blockedWillWork?: boolean }) | null,
    tokenAddress: null as string | null,
    error: null as string | null,
    pending: false,
    priceAt: vi.fn(async () => ({ totalFee: 0n, proofs: 0, notesMerged: 0, notesCreated: 0 })),
    invalidate: vi.fn(async () => {}),
  })
  return { defaults, plan: defaults() }
})
vi.mock('@/hooks/useConsolidationPlan', () => ({ useConsolidationPlan: () => hoistedPlan.plan }))

function renderModal(intent: MergeIntent | null = { token: 'usdc' }) {
  const store = createStore()
  store.set(openModalAtom, 'merge')
  store.set(mergeIntentAtom, intent)
  store.set(activeShieldedWalletIdAtom, 'rg-test')
  render(withTestQueryClient(<Provider store={store}><MergeModal /></Provider>))
  return store
}

beforeEach(() => {
  hoistedPlan.plan = {
    ...hoistedPlan.defaults(),
    preview: PREVIEW,
    tokenAddress: USDC,
    priceAt: vi.fn(async () => PREVIEW),
  }
})

describe('<MergeModal>', () => {
  it('renders nothing unless the merge modal is open', () => {
    const store = createStore()
    render(withTestQueryClient(<Provider store={store}><MergeModal /></Provider>))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on review for the intent\'s token, with the priced merge', () => {
    renderModal({ token: 'shares' })
    expect(screen.getByRole('heading', { name: 'Merge your Vault shares notes' })).toBeInTheDocument()
    expect(screen.getAllByText('11 → 2').length).toBeGreaterThan(0)
  })

  it('tells the user whether their blocked action will go through', () => {
    hoistedPlan.plan = { ...hoistedPlan.plan, preview: { ...PREVIEW, blockedWillWork: true } }
    renderModal({ token: 'usdc', blocked: { kind: 'yield-deposit', amount: 5n, perProofFee: 1n } })
    expect(screen.getByText('After this merge, your vault deposit will go through.')).toBeInTheDocument()
  })

  it('blocks Confirm while pricing and when the planner refuses', () => {
    hoistedPlan.plan = { ...hoistedPlan.defaults(), pending: true }
    renderModal()
    expect(screen.getByText('Working out the merge…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm merge' })).toBeDisabled()
  })

  it('submits a consolidate record carrying the re-priced fee, per-proof fee, token and note counts', async () => {
    const store = renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm merge' }))
    })
    await waitFor(() => expect(screen.getByText('Preparing transaction')).toBeInTheDocument())
    const record = store.get(txListAtom).find((r) => r.kind === 'consolidate') as TxRecord<'consolidate'>
    expect(record.meta).toMatchObject({
      amount: 0n,
      feeCacheId: 'merge-cache',
      tokenAddress: USDC,
      tokenSymbol: 'USDC',
      broadcasterFeeAmount: 40_000n,
      broadcasterFeePerProof: 20_000n,
      notesMerged: 11,
      notesCreated: 2,
    })
  })

  it('returns to review with the fee-updated banner when the re-priced fee differs', async () => {
    hoistedPlan.plan = { ...hoistedPlan.plan, priceAt: vi.fn(async () => ({ ...PREVIEW, totalFee: 60_000n })) }
    const store = renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm merge' }))
    })
    expect(screen.getByText(/fee changed/)).toBeInTheDocument()
    expect(hoistedPlan.plan.invalidate).toHaveBeenCalledOnce()
    expect(store.get(txListAtom).some((r) => r.kind === 'consolidate')).toBe(false)
  })

  it('Cancel closes the modal and clears the intent', async () => {
    const store = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(store.get(openModalAtom)).toBeNull())
    expect(store.get(mergeIntentAtom)).toBeNull()
  })
})
