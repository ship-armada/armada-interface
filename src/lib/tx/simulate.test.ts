// ABOUTME: Tests for simulateOrThrow — pre-flight eth_call wrapper that converts viem revert
// ABOUTME: errors into our typed TX_REVERTED TxError so the handler outer-catch routes them
// ABOUTME: to markFailed instead of MetaMask's opaque "gas limit too high" cascade.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseError } from 'viem'

const mockCall = vi.fn()

vi.mock('wagmi/actions', () => ({
  getPublicClient: vi.fn(() => ({ call: mockCall })),
}))
vi.mock('@/config/wagmi', () => ({
  wagmiConfig: {} as unknown,
}))

import { simulateOrThrow } from './simulate'
import { extractTxError } from './receipt'

const INPUT = {
  to: '0xfeeefeefeefeefeefeefeefeefeefeefeefeefee' as `0x${string}`,
  data: '0xdeadbeef' as `0x${string}`,
  value: 0n,
  account: '0xeve0eveeveeveeveeveeveeveeveeveeveevee0e' as `0x${string}`,
  chainId: 11155111,
}

beforeEach(() => {
  mockCall.mockReset()
})

describe('simulateOrThrow', () => {
  it('resolves silently when the call succeeds', async () => {
    // WHY: the helper is fire-and-forget on the happy path — no return value, no side effects
    // visible to the caller. If a future change starts returning data, callers that ignored
    // the return will silently miss it; pinning the void resolve catches that drift.
    mockCall.mockResolvedValueOnce({ data: '0x' })
    await expect(simulateOrThrow(INPUT)).resolves.toBeUndefined()
    expect(mockCall).toHaveBeenCalledWith({
      account: INPUT.account,
      to: INPUT.to,
      data: INPUT.data,
      value: INPUT.value,
    })
  })

  it('throws a typed TX_REVERTED TxError on a BaseError-wrapped revert', async () => {
    // WHY: the entire point of this helper — catch the opaque viem error and re-throw as a
    // branded TxError so classifyHandlerError preserves the category and the UI shows the
    // actual revert reason via the existing ErrorStep TX_REVERTED branch. The shortMessage
    // must propagate verbatim so the user sees the contract's reason ("MerkleRootInvalid",
    // "nullifier already used", etc.) rather than a generic message.
    const reverted = new BaseError('execution reverted: MerkleRootInvalid()')
    mockCall.mockRejectedValueOnce(reverted)

    try {
      await simulateOrThrow(INPUT)
      expect.fail('should have thrown')
    } catch (err) {
      const tx = extractTxError(err)
      expect(tx).not.toBeNull()
      expect(tx?.code).toBe('TX_REVERTED')
      expect(tx?.message).toContain('On-chain simulation reverted')
      expect(tx?.message).toContain('MerkleRootInvalid')
      // Must explicitly tell the user the wallet wasn't touched — otherwise they might think
      // they paid gas for the failure.
      expect(tx?.message).toContain('not submitted')
    }
  })

  it('extracts the inner BaseError reason via walk() — deeper errors carry the most specific message', async () => {
    // WHY: viem nests revert errors (CallExecutionError → ContractFunctionRevertedError →
    // decoded reason). walk() finds the innermost matching BaseError. A regression that
    // dropped the walk() call would surface the outer "Execution reverted." instead of the
    // specific contract error — a substantial UX loss.
    const inner = new BaseError('reverted: InvalidNullifier()')
    const outer = new BaseError('Execution reverted.', { cause: inner })
    mockCall.mockRejectedValueOnce(outer)

    try {
      await simulateOrThrow(INPUT)
      expect.fail('should have thrown')
    } catch (err) {
      const tx = extractTxError(err)
      expect(tx?.message).toContain('InvalidNullifier')
    }
  })

  it('handles a plain Error (non-BaseError) thrown from .call()', async () => {
    // WHY: defensive — viem normally throws BaseError, but a transport / network failure
    // could surface as a raw Error. The helper must still produce a TxError rather than
    // letting an unbranded throw bubble up (which would land as OTHER in classifyHandlerError).
    mockCall.mockRejectedValueOnce(new Error('network error: ECONNREFUSED'))
    try {
      await simulateOrThrow(INPUT)
      expect.fail('should have thrown')
    } catch (err) {
      const tx = extractTxError(err)
      expect(tx?.code).toBe('TX_REVERTED')
      expect(tx?.message).toContain('ECONNREFUSED')
    }
  })
})
