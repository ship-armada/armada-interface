// ABOUTME: Tests for the consolidation builder — wallet.consolidate → reviewed-fee cap → batched preflight → stash →
// ABOUTME: proveAll → one transact([...]); plus the no-proving preview with its "will the blocked spend work" dry run.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NothingToConsolidateError, UnsupportedCircuitShapeError } from '@armada/sdk'

const hoisted = vi.hoisted(() => ({
  consolidate: vi.fn(),
  planTransferAfter: vi.fn(),
  proveAll: vi.fn(),
  preflight: vi.fn(),
  buildTransactCalldata: vi.fn(),
  stashSpendPlan: vi.fn(),
}))
vi.mock('@armada/sdk', async (importActual) => ({
  ...(await importActual<typeof import('@armada/sdk')>()),
  buildTransactCalldata: hoisted.buildTransactCalldata,
}))
vi.mock('./sdk-read', () => ({
  getSdkWallet: async () => ({
    consolidate: hoisted.consolidate,
    planTransferAfter: hoisted.planTransferAfter,
    proveAll: hoisted.proveAll,
    preflight: hoisted.preflight,
  }),
}))
vi.mock('./pending-spend', () => ({ stashSpendPlan: hoisted.stashSpendPlan }))

import { buildConsolidateSdk, checkSpendPlans, previewConsolidation } from './consolidate-sdk'
import { SpendFeeIncreasedError } from './spend-fee-error'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const
const SHARES = '0x6b175474e89094c44da98b954eedeac495271d0f' as const
const POOL = '0xpool000000000000000000000000000000000000' as const
const FEE = { amount: 20_000n, recipientAddress: '0zk_relayer' }

// A consolidation group spending `inputs` notes of `token`, returning `change`, paying `fee`.
const group = (token: string, inputs: number, change: bigint, fee = 0n) => ({
  selectedInputs: Array.from({ length: inputs }, () => ({})),
  summary: { tokenAddress: token, changeValue: change, ...(fee > 0n ? { feeOutput: { value: fee } } : {}) },
})

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.consolidate.mockResolvedValue([group(USDC, 6, 100n, 20_000n), group(USDC, 5, 80n, 20_000n)])
  hoisted.proveAll.mockResolvedValue([
    { toTransactionData: () => ({ tx: 't0' }) },
    { toTransactionData: () => ({ tx: 't1' }) },
  ])
  hoisted.preflight.mockResolvedValue({ ok: true, findings: [] })
  hoisted.buildTransactCalldata.mockReturnValue({ to: POOL, data: '0xdeadbeef', value: 0n })
})

describe('buildConsolidateSdk', () => {
  it('consolidates the token at the per-proof fee, then preflights, stashes, proves and combines every group', async () => {
    const r = await buildConsolidateSdk({
      tokenAddress: USDC, broadcasterFee: FEE, poolAddress: POOL, recordId: 'rec-c', selfMetadata: '{"v":1}',
    })
    expect(hoisted.consolidate).toHaveBeenCalledWith({
      tokenAddress: USDC,
      fee: { schedule: { transfer: '20000' }, broadcasterShieldedAddress: '0zk_relayer', feesCacheId: '', expiresAt: 0 },
    })
    const plans = await hoisted.consolidate.mock.results[0]!.value
    expect(hoisted.preflight).toHaveBeenCalledWith(plans)
    expect(hoisted.stashSpendPlan).toHaveBeenCalledWith('rec-c', plans)
    expect(hoisted.proveAll).toHaveBeenCalledWith(plans, { selfMetadata: '{"v":1}' })
    expect(hoisted.buildTransactCalldata).toHaveBeenCalledWith([{ tx: 't0' }, { tx: 't1' }], POOL)
    expect(r).toEqual({ to: POOL, data: '0xdeadbeef', totalFee: 40_000n, notesMerged: 11, notesCreated: 2 })
  })

  it('counts only the consolidated token\'s notes (not a USDC fee group\'s)', async () => {
    hoisted.consolidate.mockResolvedValue([group(SHARES, 8, 500n), group(SHARES, 3, 90n), group(USDC, 1, 7n, 60_000n)])
    hoisted.proveAll.mockResolvedValue([0, 1, 2].map((i) => ({ toTransactionData: () => ({ tx: `t${i}` }) })))
    const r = await buildConsolidateSdk({ tokenAddress: SHARES, broadcasterFee: FEE, poolAddress: POOL })
    expect(r).toMatchObject({ totalFee: 60_000n, notesMerged: 11, notesCreated: 2 })
  })

  it('refuses a fee above the reviewed total before stashing or proving', async () => {
    await expect(
      buildConsolidateSdk({ tokenAddress: USDC, broadcasterFee: FEE, poolAddress: POOL, recordId: 'rec-c', maxTotalFee: 20_000n }),
    ).rejects.toBeInstanceOf(SpendFeeIncreasedError)
    expect(hoisted.stashSpendPlan).not.toHaveBeenCalled()
    expect(hoisted.proveAll).not.toHaveBeenCalled()
  })

  it('lets NothingToConsolidateError through for the caller to report', async () => {
    hoisted.consolidate.mockRejectedValue(new NothingToConsolidateError('nothing'))
    await expect(buildConsolidateSdk({ tokenAddress: USDC, broadcasterFee: FEE, poolAddress: POOL })).rejects.toBeInstanceOf(
      NothingToConsolidateError,
    )
  })
})

describe('previewConsolidation', () => {
  const BLOCKED = { outputs: [], unshield: { recipient: `0x${'ab'.repeat(20)}` as const, amount: 5n }, fee: { schedule: {}, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 } }

  it('prices the merge without proving', async () => {
    const r = await previewConsolidation({ tokenAddress: USDC, broadcasterFee: FEE })
    expect(r).toEqual({ totalFee: 40_000n, proofs: 2, notesMerged: 11, notesCreated: 2 })
    expect(hoisted.proveAll).not.toHaveBeenCalled()
    expect(hoisted.preflight).not.toHaveBeenCalled()
    expect(hoisted.planTransferAfter).not.toHaveBeenCalled()
  })

  it('reports that the blocked spend will work after the merge', async () => {
    hoisted.planTransferAfter.mockResolvedValue([{}])
    const r = await previewConsolidation({ tokenAddress: USDC, broadcasterFee: FEE, blocked: BLOCKED })
    expect(r.blockedWillWork).toBe(true)
    const plans = await hoisted.consolidate.mock.results[0]!.value
    expect(hoisted.planTransferAfter).toHaveBeenCalledWith(plans, BLOCKED)
  })

  it('reports that the blocked spend still won\'t work (another round needed)', async () => {
    hoisted.planTransferAfter.mockRejectedValue(new UnsupportedCircuitShapeError('5x3'))
    const r = await previewConsolidation({ tokenAddress: USDC, broadcasterFee: FEE, blocked: BLOCKED })
    expect(r.blockedWillWork).toBe(false)
  })

  it('rethrows an unexpected (non-planner) failure of the dry run', async () => {
    hoisted.planTransferAfter.mockRejectedValue(new Error('wallet locked'))
    await expect(previewConsolidation({ tokenAddress: USDC, broadcasterFee: FEE, blocked: BLOCKED })).rejects.toThrow(
      'wallet locked',
    )
  })
})

describe('checkSpendPlans', () => {
  const SPEND = { outputs: [], unshield: { recipient: `0x${'ab'.repeat(20)}` as const, amount: 5n }, fee: { schedule: {}, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 } }

  it('dry-runs the spend against the current notes (no merge, no proving)', async () => {
    hoisted.planTransferAfter.mockResolvedValue([{}])
    await expect(checkSpendPlans(SPEND)).resolves.toBeUndefined()
    expect(hoisted.planTransferAfter).toHaveBeenCalledWith([], SPEND)
    expect(hoisted.consolidate).not.toHaveBeenCalled()
    expect(hoisted.proveAll).not.toHaveBeenCalled()
  })

  it('throws the planner\'s error when the spend can\'t be planned', async () => {
    hoisted.planTransferAfter.mockRejectedValue(new UnsupportedCircuitShapeError('5x3'))
    await expect(checkSpendPlans(SPEND)).rejects.toBeInstanceOf(UnsupportedCircuitShapeError)
  })
})
