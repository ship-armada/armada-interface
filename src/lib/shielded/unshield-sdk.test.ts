// ABOUTME: Unit test for buildUnshieldSdk — maps inputs into a planTransfer request (unshield + fee, no
// ABOUTME: shielded outputs) and threads plan → prove → toTransactionData → buildTransactCalldata into { to, data }.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  planTransfer: vi.fn(),
  prove: vi.fn(),
  preflight: vi.fn(),
  buildTransactCalldata: vi.fn(),
  maxUnshieldAmount: vi.fn(),
}))
// Real SDK (the preflight gate uses its assertPreflight); only the calldata builder is stubbed.
vi.mock('@armada/sdk', async (importActual) => ({
  ...(await importActual<typeof import('@armada/sdk')>()),
  buildTransactCalldata: hoisted.buildTransactCalldata,
}))
vi.mock('./sdk-read', () => ({
  getSdkWallet: async () => ({
    planTransfer: hoisted.planTransfer, prove: hoisted.prove, preflight: hoisted.preflight,
    maxUnshieldAmount: hoisted.maxUnshieldAmount,
  }),
}))

import { buildUnshieldSdk, maxUnshieldAmount } from './unshield-sdk'
import { SpendFeeIncreasedError } from './spend-fee-error'

const POOL = '0xpool000000000000000000000000000000000000' as const
const RECIPIENT = '0xbob0000000000000000000000000000000000000' as const

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.planTransfer.mockResolvedValue([{ plan: true, summary: {} }]) // unsplittable → single group, no fee note
  hoisted.prove.mockResolvedValue({ toTransactionData: () => ({ tx: 'data' }) })
  hoisted.preflight.mockResolvedValue({ ok: true, findings: [] })
  hoisted.buildTransactCalldata.mockReturnValue({ to: POOL, data: '0xdeadbeef', value: 0n })
})

describe('buildUnshieldSdk', () => {
  it('plans the unshield (recipient EVM addr) + broadcaster fee, no shielded outputs, then serializes to { to, data }', async () => {
    const r = await buildUnshieldSdk({
      recipient: RECIPIENT,
      amount: 5_000_000n,
      broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
      poolAddress: POOL,
    })
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [],
      unshield: { recipient: RECIPIENT, amount: 5_000_000n },
      fee: { perProof: 20000n, broadcasterShieldedAddress: '0zk_relayer' },
    })
    expect(hoisted.buildTransactCalldata).toHaveBeenCalledWith([{ tx: 'data' }], POOL)
    expect(r).toEqual({ to: POOL, data: '0xdeadbeef', totalFee: 0n })
  })

  it('emits a zero fee (no broadcaster output) for direct submission', async () => {
    await buildUnshieldSdk({ recipient: RECIPIENT, amount: 1n, broadcasterFee: null, poolAddress: POOL })
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [],
      unshield: { recipient: RECIPIENT, amount: 1n },
    })
  })
})

describe('buildUnshieldSdk — split guard', () => {
  it('throws if the planner returns more than one group (unshields never split)', async () => {
    hoisted.planTransfer.mockResolvedValue([{ plan: 1 }, { plan: 2 }])
    await expect(
      buildUnshieldSdk({ recipient: RECIPIENT, amount: 5_000_000n, broadcasterFee: null, poolAddress: POOL }),
    ).rejects.toThrow(/single plan group/)
  })
})

describe('buildUnshieldSdk — fee actually charged', () => {
  const FEE = { amount: 20_000n, recipientAddress: '0zk_relayer' }
  const planCharging = (fee: bigint) => [{ plan: true, summary: { feeOutput: { value: fee } } }]

  it('returns the fee the plan charges (more than the quote when small change is folded into it)', async () => {
    hoisted.planTransfer.mockResolvedValue(planCharging(27_000n))
    const r = await buildUnshieldSdk({ recipient: RECIPIENT, amount: 1n, broadcasterFee: FEE, poolAddress: POOL })
    expect(r.totalFee).toBe(27_000n)
  })

  it('refuses to build when the fee exceeds what the user reviewed, before proving', async () => {
    hoisted.planTransfer.mockResolvedValue(planCharging(27_000n))
    await expect(buildUnshieldSdk({ recipient: RECIPIENT, amount: 1n, broadcasterFee: FEE, maxTotalFee: 20_000n, poolAddress: POOL })).rejects.toBeInstanceOf(SpendFeeIncreasedError)
    expect(hoisted.preflight).not.toHaveBeenCalled()
    expect(hoisted.prove).not.toHaveBeenCalled()
  })

  it('builds when the fee is at or below what the user reviewed', async () => {
    hoisted.planTransfer.mockResolvedValue(planCharging(20_000n))
    const r = await buildUnshieldSdk({ recipient: RECIPIENT, amount: 1n, broadcasterFee: FEE, maxTotalFee: 20_000n, poolAddress: POOL })
    expect(r.totalFee).toBe(20_000n)
  })
})

describe('maxUnshieldAmount', () => {
  it('is the SDK\'s unshield max at the per-proof fee (one proof, the planner\'s own rules)', async () => {
    hoisted.maxUnshieldAmount.mockResolvedValue(5_832_098n)
    expect(await maxUnshieldAmount({ perProofFee: 1_286_550n })).toBe(5_832_098n)
    expect(hoisted.maxUnshieldAmount).toHaveBeenCalledWith({
      fee: { perProof: 1286550n, broadcasterShieldedAddress: '' },
    })
  })

  it('in another token when asked — a vault withdrawal\'s Max is in shares (#82)', async () => {
    hoisted.maxUnshieldAmount.mockResolvedValue(9_000n)
    expect(await maxUnshieldAmount({ perProofFee: 0n, tokenAddress: '0x00000000000000000000000000000000000000aa' })).toBe(9_000n)
    expect(hoisted.maxUnshieldAmount).toHaveBeenCalledWith({
      fee: { perProof: 0n, broadcasterShieldedAddress: '' },
      tokenAddress: '0x00000000000000000000000000000000000000aa',
    })
  })
})
