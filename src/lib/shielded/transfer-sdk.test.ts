// ABOUTME: Unit test for buildTransferSdk — maps inputs into a planTransfer request (outputs + fee) and
// ABOUTME: threads plan(s) → batched preflight → proveAll → buildTransactCalldata; plus review-time fee planning + Max.

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

import { buildTransferSdk, planTransferFee, maxTransferAmount, TransferFeeIncreasedError } from './transfer-sdk'

const POOL = '0xpool000000000000000000000000000000000000' as const

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.planTransfer.mockResolvedValue([{ plan: true, summary: {} }]) // one group (the common, unfragmented case)
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
    expect(r).toEqual({ to: POOL, data: '0xdeadbeef', totalFee: 0n })
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
    expect(hoisted.stashSpendPlan).toHaveBeenCalledWith('rec-9', [{ plan: true, summary: {} }])
    expect(hoisted.proveAll).toHaveBeenCalledWith([{ plan: true, summary: {} }], { selfMetadata: '{"v":1,"c":"q"}' })
  })

  it('does not stash a plan when no recordId is supplied', async () => {
    await buildTransferSdk({ recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL })
    expect(hoisted.stashSpendPlan).not.toHaveBeenCalled()
  })

  it('proves EVERY group of a split (fragmented) transfer via proveAll and combines them into one transact([...])', async () => {
    hoisted.planTransfer.mockResolvedValue([{ plan: 'a', summary: {} }, { plan: 'b', summary: {} }])
    hoisted.proveAll.mockResolvedValue([
      { toTransactionData: () => ({ tx: 't0' }) },
      { toTransactionData: () => ({ tx: 't1' }) },
    ])
    const r = await buildTransferSdk({
      recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL, recordId: 'rec-multi',
    })
    // ONE batched preflight over all groups, and ONE proveAll (one signing ceremony for the whole batch).
    expect(hoisted.preflight).toHaveBeenCalledTimes(1)
    expect(hoisted.preflight).toHaveBeenCalledWith([{ plan: 'a', summary: {} }, { plan: 'b', summary: {} }])
    expect(hoisted.proveAll).toHaveBeenCalledTimes(1)
    expect(hoisted.proveAll).toHaveBeenCalledWith([{ plan: 'a', summary: {} }, { plan: 'b', summary: {} }], {})
    // All groups' inputs stashed under the one record (one atomic tx).
    expect(hoisted.stashSpendPlan).toHaveBeenCalledWith('rec-multi', [{ plan: 'a', summary: {} }, { plan: 'b', summary: {} }])
    // Both proved transactions combined into a single transact([...]) calldata, in group order.
    expect(hoisted.buildTransactCalldata).toHaveBeenCalledWith([{ tx: 't0' }, { tx: 't1' }], POOL)
    expect(r).toEqual({ to: POOL, data: '0xdeadbeef', totalFee: 0n })
  })
})

// A planner group carrying `fee` to the broadcaster (0n → no fee note).
const group = (fee: bigint) => ({ summary: fee > 0n ? { feeOutput: { value: fee } } : {} })
const FEE = { amount: 20_000n, recipientAddress: '0zk_relayer' }

describe('buildTransferSdk — actual fee', () => {
  it('returns the total fee actually charged across every group', async () => {
    hoisted.planTransfer.mockResolvedValue([group(30_000n), group(10_000n)])
    hoisted.proveAll.mockResolvedValue([
      { toTransactionData: () => ({ tx: 't0' }) },
      { toTransactionData: () => ({ tx: 't1' }) },
    ])
    const r = await buildTransferSdk({ recipient: '0zk_bob', amount: 1n, broadcasterFee: FEE, poolAddress: POOL })
    expect(r.totalFee).toBe(40_000n)
  })

  it('refuses to build when the fee exceeds what the user reviewed, before stashing or proving', async () => {
    hoisted.planTransfer.mockResolvedValue([group(20_000n), group(20_000n)])
    await expect(
      buildTransferSdk({
        recipient: '0zk_bob', amount: 1n, broadcasterFee: FEE, poolAddress: POOL,
        recordId: 'rec-1', maxTotalFee: 20_000n,
      }),
    ).rejects.toBeInstanceOf(TransferFeeIncreasedError)
    expect(hoisted.stashSpendPlan).not.toHaveBeenCalled()
    expect(hoisted.proveAll).not.toHaveBeenCalled()
  })

  it('builds when the fee is at or below what the user reviewed', async () => {
    hoisted.planTransfer.mockResolvedValue([group(20_000n)])
    const r = await buildTransferSdk({
      recipient: '0zk_bob', amount: 1n, broadcasterFee: FEE, poolAddress: POOL, maxTotalFee: 40_000n,
    })
    expect(r.totalFee).toBe(20_000n)
  })
})

describe('planTransferFee', () => {
  it('plans without proving and sums the fee notes across groups', async () => {
    hoisted.planTransfer.mockResolvedValue([group(20_000n), group(20_000n)])
    const r = await planTransferFee({ recipient: '0zk_bob', amount: 5n, broadcasterFee: FEE })
    expect(r).toEqual({ totalFee: 40_000n, proofs: 2 })
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [{ to0zk: '0zk_bob', amount: 5n }],
      fee: { schedule: { transfer: '20000' }, broadcasterShieldedAddress: '0zk_relayer', feesCacheId: '', expiresAt: 0 },
    })
    expect(hoisted.proveAll).not.toHaveBeenCalled()
    expect(hoisted.preflight).not.toHaveBeenCalled()
  })
})

describe('maxTransferAmount', () => {
  it('is balance minus one fee when that plans as a single proof', async () => {
    hoisted.planTransfer.mockResolvedValue([group(20_000n)])
    expect(await maxTransferAmount({ recipient: '0zk_bob', balance: 1_000_000n, broadcasterFee: FEE })).toBe(980_000n)
  })

  it('lowers the amount until amount + the split fee fits the balance', async () => {
    // Anything above 500_000 needs 2 proofs (2 fees); the search settles one fee lower than the naive max.
    hoisted.planTransfer.mockImplementation(async ({ outputs }: { outputs: { amount: bigint }[] }) =>
      outputs[0]!.amount > 500_000n ? [group(20_000n), group(20_000n)] : [group(20_000n)],
    )
    expect(await maxTransferAmount({ recipient: '0zk_bob', balance: 1_000_000n, broadcasterFee: FEE })).toBe(960_000n)
  })

  it('is the whole balance when there is no fee', async () => {
    hoisted.planTransfer.mockResolvedValue([group(0n)])
    expect(await maxTransferAmount({ recipient: '0zk_bob', balance: 1_000_000n, broadcasterFee: null })).toBe(1_000_000n)
  })

  it('is zero when the balance cannot cover the fee', async () => {
    expect(await maxTransferAmount({ recipient: '0zk_bob', balance: 10_000n, broadcasterFee: FEE })).toBe(0n)
    expect(hoisted.planTransfer).not.toHaveBeenCalled()
  })

  it('propagates a planner error (e.g. too fragmented) for the caller to surface', async () => {
    hoisted.planTransfer.mockRejectedValue(new Error('too fragmented'))
    await expect(maxTransferAmount({ recipient: '0zk_bob', balance: 1_000_000n, broadcasterFee: FEE })).rejects.toThrow(
      'too fragmented',
    )
  })
})
