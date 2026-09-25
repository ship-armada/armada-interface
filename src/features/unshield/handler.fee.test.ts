// ABOUTME: Tests for the unshield-local handler's build-proof fee handling: it plans at the per-proof fee, caps the build
// ABOUTME: at the reviewed total, and records the fee actually charged (the SDK may fold small change into it).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({ build: vi.fn() }))

vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/unshield-sdk', () => ({ buildUnshieldSdk: hoisted.build }))
vi.mock('@/lib/shielded/pending-spend', () => ({
  markSpendPendingForRecord: vi.fn(async () => {}),
  clearSpendPendingForTx: vi.fn(async () => {}),
  forgetSpendPlan: vi.fn(),
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: async () => ({ hub: { contracts: { privacyPool: '0xpool' } } }),
  loadYieldDeployment: async () => ({ contracts: { armadaYieldVault: '0xvault', armadaYieldAdapter: '0xadapter' } }),
}))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => true, getWalletId: () => 'rw-1', getShieldedAddress: () => '0zk_me' }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/selfMetadata', () => ({ encodeTxSelfMetadata: () => undefined }))

import { unshieldLocalHandler } from './handler'
import { SpendFeeIncreasedError } from '@/lib/shielded/spend-fee-error'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

type Rec = TxRecord<'unshield-local'>

function makeCtx() {
  const upserts: Rec[] = []
  const ctx: ExecutorCtx<'unshield-local'> = {
    signal: new AbortController().signal,
    upsert: async (r) => { upserts.push(r as Rec) },
  }
  return { ctx, upserts }
}

function buildRecord(meta: Partial<Rec['meta']> = {}): Rec {
  return {
    id: 'rec-unshield-local',
    kind: 'unshield-local',
    executionState: 'active',
    stage: 'build-proof',
    stagesCompleted: [],
    updatedSeq: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {
      amount: 1_000_000n,
      feeCacheId: 'c',
      recipient: '0x1234567890abcdef1234567890abcdef12345678',
      // Reviewed: a 20_000 per-proof fee with 7_000 of change folded into it.
      broadcasterFeeAmount: 27_000n,
      broadcasterFeePerProof: 20_000n,
      broadcasterShieldedAddress: '0zk_relayer',
      ...meta,
    },
    artifacts: {},
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as Rec
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.build.mockResolvedValue({ to: '0xto', data: '0xdead', totalFee: 27_000n })
})

describe('unshieldLocalHandler — build-proof fee', () => {
  it('plans at the per-proof fee and caps the build at the reviewed total', async () => {
    const { ctx } = makeCtx()
    await unshieldLocalHandler.run(buildRecord(), ctx)
    expect(hoisted.build).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
        maxTotalFee: 27_000n,
      }),
    )
  })

  it('records the fee actually charged when the build comes in below the reviewed total', async () => {
    hoisted.build.mockResolvedValue({ to: '0xto', data: '0xdead', totalFee: 20_000n })
    const { ctx, upserts } = makeCtx()
    await unshieldLocalHandler.run(buildRecord(), ctx)
    const built = upserts.at(-1)!
    expect(built.stage).toBe('submit-relayer')
    expect(built.meta.broadcasterFeeAmount).toBe(20_000n)
  })

  it('plans a record without a per-proof fee at its stored fee (records from before review-time planning)', async () => {
    const { ctx } = makeCtx()
    await unshieldLocalHandler.run(buildRecord({ broadcasterFeeAmount: 20_000n, broadcasterFeePerProof: undefined }), ctx)
    expect(hoisted.build).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
        maxTotalFee: 20_000n,
      }),
    )
  })

  it('fails with FEE_EXPIRED (start over, no retry) when the fee rose since review', async () => {
    hoisted.build.mockRejectedValue(new SpendFeeIncreasedError(27_000n, 40_000n))
    const { ctx, upserts } = makeCtx()
    await unshieldLocalHandler.run(buildRecord(), ctx)
    const failed = upserts.at(-1)!
    expect(failed.executionState).toBe('failed')
    expect(failed.artifacts.error?.code).toBe('FEE_EXPIRED')
  })
})
