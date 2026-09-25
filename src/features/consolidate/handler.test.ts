// ABOUTME: Tests for the consolidate handler — build-proof (per-proof fee, reviewed-fee cap, merge tag, actual fee +
// ABOUTME: note counts recorded), the relayer submit of the stashed calldata, and stashed-plan cleanup on failure.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  buildConsolidateSdk: vi.fn(),
  forgetSpendPlan: vi.fn(),
  markSpendPendingForRecord: vi.fn(async () => {}),
  submitRelay: vi.fn(),
  poll: vi.fn(),
}))

vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/consolidate-sdk', () => ({ buildConsolidateSdk: hoisted.buildConsolidateSdk }))
vi.mock('@/lib/shielded/pending-spend', () => ({
  markSpendPendingForRecord: hoisted.markSpendPendingForRecord,
  clearSpendPendingForTx: vi.fn(async () => {}),
  forgetSpendPlan: hoisted.forgetSpendPlan,
}))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/relayer')>()),
  submitRelay: hoisted.submitRelay,
}))
vi.mock('@/lib/tx/poller', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tx/poller')>()),
  poll: hoisted.poll,
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: async () => ({ hub: { contracts: { privacyPool: '0xpool' } } }),
}))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => true, getWalletId: () => 'rw-1' }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))

import { consolidateHandler } from './handler'
import { SpendFeeIncreasedError } from '@/lib/shielded/spend-fee-error'
import { decodeTxSelfMetadata } from '@/lib/shielded/selfMetadata'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const

function makeCtx() {
  const upserts: TxRecord<'consolidate'>[] = []
  const ctx: ExecutorCtx<'consolidate'> = {
    signal: new AbortController().signal,
    upsert: async (r) => { upserts.push(r as TxRecord<'consolidate'>) },
  }
  return { ctx, upserts }
}

function mergeRecord(over: Partial<TxRecord<'consolidate'>> = {}): TxRecord<'consolidate'> {
  return {
    id: 'rec-merge',
    kind: 'consolidate',
    executionState: 'active',
    stage: 'build-proof',
    stagesCompleted: [],
    updatedSeq: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {
      amount: 0n,
      feeCacheId: 'c1',
      tokenAddress: USDC,
      tokenSymbol: 'USDC',
      broadcasterFeeAmount: 40_000n,
      broadcasterFeePerProof: 20_000n,
      broadcasterShieldedAddress: '0zk_relayer',
      notesMerged: 11,
      notesCreated: 2,
    },
    artifacts: {},
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
    ...over,
  } as TxRecord<'consolidate'>
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.buildConsolidateSdk.mockResolvedValue({ to: '0xpool', data: '0xmerge', totalFee: 40_000n, notesMerged: 11, notesCreated: 2 })
})

describe('consolidateHandler — build-proof', () => {
  it('merges the token at the per-proof fee, capped at the reviewed total, tagged as a merge', async () => {
    const { ctx, upserts } = makeCtx()
    await consolidateHandler.run(mergeRecord(), ctx)
    expect(hoisted.buildConsolidateSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAddress: USDC,
        broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
        maxTotalFee: 40_000n,
        poolAddress: '0xpool',
        recordId: 'rec-merge',
      }),
    )
    const { selfMetadata } = hoisted.buildConsolidateSdk.mock.calls[0]![0] as { selfMetadata: string }
    expect(decodeTxSelfMetadata(selfMetadata)).toEqual({ feeCacheId: 'c1', consolidation: true })
    const built = upserts.at(-1)!
    expect(built.stage).toBe('submit-relayer')
    expect(built.artifacts.consolidateTx).toEqual({ to: '0xpool', data: '0xmerge', value: '0' })
  })

  it('records what the build actually does (fee and note counts) when it differs from review', async () => {
    hoisted.buildConsolidateSdk.mockResolvedValue({ to: '0xpool', data: '0xmerge', totalFee: 20_000n, notesMerged: 6, notesCreated: 1 })
    const { ctx, upserts } = makeCtx()
    await consolidateHandler.run(mergeRecord(), ctx)
    expect(upserts.at(-1)!.meta).toMatchObject({ broadcasterFeeAmount: 20_000n, notesMerged: 6, notesCreated: 1 })
  })

  it('fails with FEE_EXPIRED (start over) when the fee rose since review', async () => {
    hoisted.buildConsolidateSdk.mockRejectedValue(new SpendFeeIncreasedError(40_000n, 60_000n))
    const { ctx, upserts } = makeCtx()
    await consolidateHandler.run(mergeRecord(), ctx)
    expect(upserts.at(-1)!.artifacts.error?.code).toBe('FEE_EXPIRED')
    expect(hoisted.forgetSpendPlan).toHaveBeenCalledWith('rec-merge')
  })
})

describe('consolidateHandler — submit', () => {
  it('relays the stashed calldata, holds the merged notes, and confirms', async () => {
    hoisted.submitRelay.mockResolvedValue({ txHash: '0xfeed' })
    hoisted.poll.mockResolvedValue({ status: 'done', value: { status: 'confirmed' } })
    const { ctx, upserts } = makeCtx()
    await consolidateHandler.run(
      mergeRecord({ stage: 'submit-relayer', artifacts: { consolidateTx: { to: '0xpool', data: '0xmerge', value: '0' } } }),
      ctx,
    )
    expect(hoisted.submitRelay).toHaveBeenCalledWith(
      expect.objectContaining({ to: '0xpool', data: '0xmerge', feesCacheId: 'c1', idempotencyKey: 'rec-merge' }),
      expect.anything(),
    )
    expect(hoisted.markSpendPendingForRecord).toHaveBeenCalledWith('rec-merge', '0xfeed')
    const last = upserts.at(-1)!
    expect(last.stage).toBe('hub-confirmed')
    expect(last.executionState).toBe('completed')
  })

  it('forgets the stashed plans when the relayer refuses the submission (nothing broadcast)', async () => {
    hoisted.submitRelay.mockRejectedValue(new Error('relayer down'))
    const { ctx } = makeCtx()
    await consolidateHandler.run(
      mergeRecord({ stage: 'submit-relayer', artifacts: { consolidateTx: { to: '0xpool', data: '0xmerge', value: '0' } } }),
      ctx,
    )
    expect(hoisted.forgetSpendPlan).toHaveBeenCalledWith('rec-merge')
  })
})
