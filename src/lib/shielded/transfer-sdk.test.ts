// ABOUTME: Unit test for buildTransferSdk — maps inputs into a planTransfer request (outputs + fee) and
// ABOUTME: threads plan → prove → toTransactionData → buildTransactCalldata into the { to, data } result.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  planTransfer: vi.fn(),
  prove: vi.fn(),
  preflight: vi.fn(),
  buildTransactCalldata: vi.fn(),
  stashSpendPlan: vi.fn(),
}))
vi.mock('@armada/sdk', () => ({ buildTransactCalldata: hoisted.buildTransactCalldata }))
vi.mock('./sdk-read', () => ({
  getSdkWallet: async () => ({ planTransfer: hoisted.planTransfer, prove: hoisted.prove, preflight: hoisted.preflight }),
}))
vi.mock('./pending-spend', () => ({ stashSpendPlan: hoisted.stashSpendPlan }))

import { buildTransferSdk } from './transfer-sdk'

const POOL = '0xpool000000000000000000000000000000000000' as const

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.planTransfer.mockResolvedValue({ plan: true })
  hoisted.prove.mockResolvedValue({ toTransactionData: () => ({ tx: 'data' }) })
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
    expect(hoisted.stashSpendPlan).toHaveBeenCalledWith('rec-9', { plan: true })
    expect(hoisted.prove).toHaveBeenCalledWith({ plan: true }, { selfMetadata: '{"v":1,"c":"q"}' })
  })

  it('does not stash a plan when no recordId is supplied', async () => {
    await buildTransferSdk({ recipient: '0zk_bob', amount: 1n, broadcasterFee: null, poolAddress: POOL })
    expect(hoisted.stashSpendPlan).not.toHaveBeenCalled()
  })
})
