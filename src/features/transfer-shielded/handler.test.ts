// ABOUTME: Tests for the transfer-shielded handler's build-proof fee handling and spend-plan cleanup: it plans
// ABOUTME: at the per-proof fee, caps the build at the reviewed total, records the fee actually charged, and forgets stashed plans on failure.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  buildTransferSdk: vi.fn(),
  forgetSpendPlan: vi.fn(),
  submitRelay: vi.fn(),
}))

vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/transfer-sdk', () => ({ buildTransferSdk: hoisted.buildTransferSdk }))
vi.mock('@/lib/shielded/pending-spend', () => ({
  markSpendPendingForRecord: vi.fn(async () => {}),
  clearSpendPendingForTx: vi.fn(async () => {}),
  forgetSpendPlan: hoisted.forgetSpendPlan,
}))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/relayer')>()),
  submitRelay: hoisted.submitRelay,
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: async () => ({ hub: { contracts: { privacyPool: '0xpool' } } }),
}))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => true, getWalletId: () => 'rw-1' }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/selfMetadata', () => ({ encodeTxSelfMetadata: () => undefined }))

import { transferShieldedHandler } from './handler'
import { SpendFeeIncreasedError } from '@/lib/shielded/spend-fee-error'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

function makeCtx() {
  const upserts: TxRecord<'transfer-shielded'>[] = []
  const ctx: ExecutorCtx<'transfer-shielded'> = {
    signal: new AbortController().signal,
    upsert: async (r) => { upserts.push(r as TxRecord<'transfer-shielded'>) },
  }
  return { ctx, upserts }
}

function buildRecord(meta: Partial<TxRecord<'transfer-shielded'>['meta']> = {}): TxRecord<'transfer-shielded'> {
  return {
    id: 'rec-transfer',
    kind: 'transfer-shielded',
    executionState: 'active',
    stage: 'build-proof',
    stagesCompleted: [],
    updatedSeq: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {
      amount: 1_000_000n,
      feeCacheId: 'c',
      recipient: '0zk_bob',
      broadcasterFeeAmount: 40_000n,
      broadcasterFeePerProof: 20_000n,
      broadcasterShieldedAddress: '0zk_relayer',
      ...meta,
    },
    artifacts: {},
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as TxRecord<'transfer-shielded'>
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.buildTransferSdk.mockResolvedValue({ to: '0xpool', data: '0xdead', totalFee: 40_000n })
})

describe('transferShieldedHandler — build-proof fee', () => {
  it('plans at the per-proof fee and caps the build at the reviewed total', async () => {
    const { ctx } = makeCtx()
    await transferShieldedHandler.run(buildRecord(), ctx)
    expect(hoisted.buildTransferSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
        maxTotalFee: 40_000n,
      }),
    )
  })

  it('records the fee actually charged when the build comes in below the reviewed total', async () => {
    hoisted.buildTransferSdk.mockResolvedValue({ to: '0xpool', data: '0xdead', totalFee: 20_000n })
    const { ctx, upserts } = makeCtx()
    await transferShieldedHandler.run(buildRecord(), ctx)
    const built = upserts.at(-1)!
    expect(built.stage).toBe('submit-relayer')
    expect(built.meta.broadcasterFeeAmount).toBe(20_000n)
  })

  it('plans a record without a per-proof fee at its stored fee (single-proof records)', async () => {
    const { ctx } = makeCtx()
    await transferShieldedHandler.run(buildRecord({ broadcasterFeeAmount: 20_000n, broadcasterFeePerProof: undefined }), ctx)
    expect(hoisted.buildTransferSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
        maxTotalFee: 20_000n,
      }),
    )
  })

  it('fails with FEE_EXPIRED (start over, no retry) when the fee rose since review', async () => {
    hoisted.buildTransferSdk.mockRejectedValue(new SpendFeeIncreasedError(40_000n, 60_000n))
    const { ctx, upserts } = makeCtx()
    await transferShieldedHandler.run(buildRecord(), ctx)
    const failed = upserts.at(-1)!
    expect(failed.executionState).toBe('failed')
    expect(failed.artifacts.error?.code).toBe('FEE_EXPIRED')
  })
})

describe('transferShieldedHandler — stashed plan cleanup', () => {
  it('forgets the stashed plans when the build fails', async () => {
    hoisted.buildTransferSdk.mockRejectedValue(new Error('prover crashed'))
    const { ctx } = makeCtx()
    await transferShieldedHandler.run(buildRecord(), ctx)
    expect(hoisted.forgetSpendPlan).toHaveBeenCalledWith('rec-transfer')
  })

  it('forgets the stashed plans when the relayer refuses the submission (nothing broadcast)', async () => {
    hoisted.submitRelay.mockRejectedValue(new Error('relayer down'))
    const { ctx } = makeCtx()
    const record: TxRecord<'transfer-shielded'> = {
      ...buildRecord(),
      stage: 'submit-relayer',
      artifacts: { transferTx: { to: '0xpool', data: '0xdead', value: '0' } },
    }
    await transferShieldedHandler.run(record, ctx)
    expect(hoisted.forgetSpendPlan).toHaveBeenCalledWith('rec-transfer')
  })
})
