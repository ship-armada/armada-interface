// ABOUTME: Unit test for buildXchainUnshieldSdk — plans the unshield to the POOL with a CCTP-binding adaptParams,
// ABOUTME: proves, and encodes atomicCrossChainUnshield from transactionToTuple + the CCTP args.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  planTransfer: vi.fn(),
  prove: vi.fn(),
  preflight: vi.fn(),
  transactionToTuple: vi.fn(),
  encodeCctpBinding: vi.fn(),
  encodeFunctionData: vi.fn(),
}))
vi.mock('@armada/sdk', () => ({
  transactionToTuple: hoisted.transactionToTuple,
  encodeCctpBinding: hoisted.encodeCctpBinding,
}))
vi.mock('viem', async (importActual) => {
  const actual = await importActual<typeof import('viem')>()
  return { ...actual, encodeFunctionData: hoisted.encodeFunctionData }
})
vi.mock('./sdk-read', () => ({
  getSdkWallet: async () => ({ planTransfer: hoisted.planTransfer, prove: hoisted.prove, preflight: hoisted.preflight }),
}))

import { buildXchainUnshieldSdk } from './unshield-xchain-sdk'
import { SpendFeeIncreasedError } from './spend-fee-error'

const POOL = '0xpool000000000000000000000000000000000000' as const
const FINAL = '0xbob0000000000000000000000000000000000000' as const
const NONCE = `0x${'11'.repeat(32)}` as const
const BINDING = `0x${'cd'.repeat(32)}` as const

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.planTransfer.mockResolvedValue([{ plan: true, summary: {} }]) // unsplittable → single group, no fee note
  hoisted.prove.mockResolvedValue({ toTransactionData: () => ({ tx: 'data' }) })
  hoisted.preflight.mockResolvedValue({ ok: true, findings: [] })
  hoisted.transactionToTuple.mockReturnValue(['TUPLE'])
  hoisted.encodeCctpBinding.mockReturnValue(BINDING)
  hoisted.encodeFunctionData.mockReturnValue('0xcalldata')
})

describe('buildXchainUnshieldSdk', () => {
  it('plans the unshield to the POOL with the CCTP-binding adaptParams, then encodes the wrapper call', async () => {
    const r = await buildXchainUnshieldSdk({
      amount: 5_000_000n,
      broadcasterFee: { amount: 20_000n, recipientAddress: '0zk_relayer' },
      privacyPoolAddress: POOL,
      finalRecipient: FINAL,
      destinationDomain: 6,
      maxFee: 1_000n,
      uniqueNonce: NONCE,
    })
    // The binding covers the real destination (finalRecipient + domain + maxFee).
    expect(hoisted.encodeCctpBinding).toHaveBeenCalledWith(FINAL, 6, 1_000n)
    // The unshield note's recipient is the POOL (it forwards via CCTP); adaptParams carries the binding.
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [],
      unshield: { recipient: POOL, amount: 5_000_000n, adaptParams: BINDING },
      fee: { schedule: { transfer: '20000' }, broadcasterShieldedAddress: '0zk_relayer', feesCacheId: '', expiresAt: 0 },
    })
    // The proved tx is embedded as a POSITIONAL tuple, then the CCTP args.
    expect(hoisted.transactionToTuple).toHaveBeenCalledWith({ tx: 'data' })
    expect(hoisted.encodeFunctionData).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'atomicCrossChainUnshield',
        args: [['TUPLE'], 6, FINAL, 1_000n, NONCE],
      }),
    )
    expect(r).toEqual({ to: POOL, data: '0xcalldata', totalFee: 0n })
  })

  it('emits a zero fee (no broadcaster output) for direct submission', async () => {
    await buildXchainUnshieldSdk({
      amount: 1n,
      broadcasterFee: null,
      privacyPoolAddress: POOL,
      finalRecipient: FINAL,
      destinationDomain: 6,
      maxFee: 0n,
      uniqueNonce: NONCE,
    })
    expect(hoisted.planTransfer).toHaveBeenCalledWith({
      outputs: [],
      unshield: { recipient: POOL, amount: 1n, adaptParams: BINDING },
      fee: { schedule: { transfer: '0' }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 },
    })
  })
})

describe('buildXchainUnshieldSdk — split guard', () => {
  it('throws if the planner returns more than one group (xchain unshields never split)', async () => {
    hoisted.planTransfer.mockResolvedValue([{ plan: 1 }, { plan: 2 }])
    await expect(
      buildXchainUnshieldSdk({
        amount: 5_000_000n, broadcasterFee: null, privacyPoolAddress: POOL,
        finalRecipient: FINAL, destinationDomain: 6, maxFee: 1_000n, uniqueNonce: NONCE,
      }),
    ).rejects.toThrow(/single plan group/)
  })
})

describe('buildXchainUnshieldSdk — fee actually charged', () => {
  const FEE = { amount: 20_000n, recipientAddress: '0zk_relayer' }
  const planCharging = (fee: bigint) => [{ plan: true, summary: { feeOutput: { value: fee } } }]

  it('returns the fee the plan charges (more than the quote when small change is folded into it)', async () => {
    hoisted.planTransfer.mockResolvedValue(planCharging(27_000n))
    const r = await buildXchainUnshieldSdk({ amount: 1n, broadcasterFee: FEE, privacyPoolAddress: POOL, finalRecipient: FINAL, destinationDomain: 6, maxFee: 1_000n, uniqueNonce: NONCE })
    expect(r.totalFee).toBe(27_000n)
  })

  it('refuses to build when the fee exceeds what the user reviewed, before proving', async () => {
    hoisted.planTransfer.mockResolvedValue(planCharging(27_000n))
    await expect(buildXchainUnshieldSdk({ amount: 1n, broadcasterFee: FEE, maxTotalFee: 20_000n, privacyPoolAddress: POOL, finalRecipient: FINAL, destinationDomain: 6, maxFee: 1_000n, uniqueNonce: NONCE })).rejects.toBeInstanceOf(SpendFeeIncreasedError)
    expect(hoisted.preflight).not.toHaveBeenCalled()
    expect(hoisted.prove).not.toHaveBeenCalled()
  })

  it('builds when the fee is at or below what the user reviewed', async () => {
    hoisted.planTransfer.mockResolvedValue(planCharging(20_000n))
    const r = await buildXchainUnshieldSdk({ amount: 1n, broadcasterFee: FEE, maxTotalFee: 20_000n, privacyPoolAddress: POOL, finalRecipient: FINAL, destinationDomain: 6, maxFee: 1_000n, uniqueNonce: NONCE })
    expect(r.totalFee).toBe(20_000n)
  })
})
