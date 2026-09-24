// ABOUTME: Unit test for buildTransferSdk — maps inputs into a planTransfer request (outputs + fee) and
// ABOUTME: threads plan(s) → batched preflight → proveAll → buildTransactCalldata into the { to, data } result.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  planTransfer: vi.fn(),
  proveAll: vi.fn(),
  preflight: vi.fn(),
  buildTransactCalldata: vi.fn(),
  stashSpendPlan: vi.fn(),
}))
vi.mock('@armada/sdk', () => ({ buildTransactCalldata: hoisted.buildTransactCalldata }))
vi.mock('./sdk-read', () => ({
  getSdkWallet: async () => ({ planTransfer: hoisted.planTransfer, proveAll: hoisted.proveAll, preflight: hoisted.preflight }),
}))
vi.mock('./pending-spend', () => ({ stashSpendPlan: hoisted.stashSpendPlan }))

import { buildTransferSdk } from './transfer-sdk'

const POOL = '0xpool000000000000000000000000000000000000' as const

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.planTransfer.mockResolvedValue([{ plan: true }]) // one group (the common, unfragmented case)
  hoisted.proveAll.mockResolvedValue([{ toTransactionData: () => ({ tx: 'data' }) }])
  hoisted.preflight.mockResolvedValue({ ok: true, findings: [] })
  hoisted.buildTransactCalldata.mockReturnValue({ to: POOL, data: '0xdeadbeef', value: 0n })
})

describe('buildTransferSdk', () => {
  it('plans with the recipient output + broadcaster fee, then serializes the proved tx to { to, data }', async () => {
    const r = await buildTransferSdk({
      recipient: '0zk_bob',
      amount: 5_000_000n,
      broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
      poolAddress: POOL,
    })
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [{ to0zk: '0zk_bob', amount: 5_000_000n }],
      fee: { schedule: { transfer: '20000' }, broadcasterShieldedAddress: '0zk_relayer', feesCacheId: '', expiresAt: 0 },
    })
    expect(hoisted.buildTransactCalldata).toHaveBeenCalledWith([{ tx: 'data' }], POOL)
    expect(r).toEqual({ to: POOL, data: '0xdeadbeef' })
  })

  it('emits a zero fee (no broadcaster output) for direct submission', async () => {
    await buildTransferSdk({ recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL })
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [{ to0zk: '0zk_bob', amount: 1n }],
      fee: { schedule: { transfer: '0' }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 },
    })
  })

  it('stashes the plan under recordId (#55) and passes selfMetadata to prove (#44)', async () => {
    await buildTransferSdk({
      recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL,
      recordId: 'rec-9', selfMetadata: '{"v":1,"c":"q"}',
    })
    expect(hoisted.stashSpendPlan).toHaveBeenCalledWith('rec-9', [{ plan: true }])
    expect(hoisted.proveAll).toHaveBeenCalledWith([{ plan: true }], { selfMetadata: '{"v":1,"c":"q"}' })
  })

  it('does not stash a plan when no recordId is supplied', async () => {
    await buildTransferSdk({ recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL })
    expect(hoisted.stashSpendPlan).not.toHaveBeenCalled()
  })

  it('proves EVERY group of a split (fragmented) transfer via proveAll and combines them into one transact([...])', async () => {
    hoisted.planTransfer.mockResolvedValue([{ plan: 'a' }, { plan: 'b' }])
    hoisted.proveAll.mockResolvedValue([
      { toTransactionData: () => ({ tx: 't0' }) },
      { toTransactionData: () => ({ tx: 't1' }) },
    ])
    const r = await buildTransferSdk({
      recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL, recordId: 'rec-multi',
    })
    // ONE batched preflight over all groups, and ONE proveAll (one signing ceremony for the whole batch).
    expect(hoisted.preflight).toHaveBeenCalledTimes(1)
    expect(hoisted.preflight).toHaveBeenCalledWith([{ plan: 'a' }, { plan: 'b' }])
    expect(hoisted.proveAll).toHaveBeenCalledTimes(1)
    expect(hoisted.proveAll).toHaveBeenCalledWith([{ plan: 'a' }, { plan: 'b' }], {})
    // All groups' inputs stashed under the one record (one atomic tx).
    expect(hoisted.stashSpendPlan).toHaveBeenCalledWith('rec-multi', [{ plan: 'a' }, { plan: 'b' }])
    // Both proved transactions combined into a single transact([...]) calldata, in group order.
    expect(hoisted.buildTransactCalldata).toHaveBeenCalledWith([{ tx: 't0' }, { tx: 't1' }], POOL)
    expect(r).toEqual({ to: POOL, data: '0xdeadbeef' })
  })
})
