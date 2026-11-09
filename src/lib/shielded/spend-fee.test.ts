// ABOUTME: Tests for spend-fee — the fee a spend's plans charge (totalFeeOf), the reviewed-fee cap (assertReviewedFee), and
// ABOUTME: what a spend's plans return to the wallet (returnsToSelfOf: change plus outputs to its own 0zk).

import { describe, it, expect } from 'vitest'
import type { Plan } from '@armada/sdk'
import { SpendFeeIncreasedError } from './spend-fee-error'
import { assertReviewedFee, returnsToSelfOf, totalFeeOf } from './spend-fee'

const OWN = '0zk1own'
const USDC = `0x${'aa'.repeat(20)}` as const
function plan(changeValue: bigint, outputs: { to: string; value: bigint }[] = [], fee?: bigint): Pick<Plan, 'summary'> {
  return {
    summary: {
      tokenAddress: USDC,
      inputTotal: 0n,
      changeValue,
      outputs: outputs.map((o) => ({ toShieldedAddress: o.to, value: o.value, tokenAddress: USDC })),
      ...(fee !== undefined ? { feeOutput: { toShieldedAddress: '0zk1relayer', value: fee, tokenAddress: USDC } } : {}),
    },
  }
}

describe('returnsToSelfOf', () => {
  it("is a send's change — the recipient's output and the fee leave the wallet", () => {
    expect(returnsToSelfOf([plan(16n, [{ to: '0zk1bob', value: 5n }], 1n)], OWN)).toBe(16n)
  })

  it("sums every group of a split spend", () => {
    expect(returnsToSelfOf([plan(3n, [{ to: '0zk1bob', value: 5n }]), plan(4n, [{ to: '0zk1bob', value: 2n }])], OWN)).toBe(7n)
  })

  it('counts an output to the wallet itself (a send to your own 0zk, a merge)', () => {
    expect(returnsToSelfOf([plan(0n, [{ to: OWN, value: 29n }], 1n)], OWN)).toBe(29n)
  })

  it('is 0 when everything leaves (an unshield of the whole balance)', () => {
    expect(returnsToSelfOf([plan(0n)], OWN)).toBe(0n)
  })
})

describe('totalFeeOf / assertReviewedFee', () => {
  it('sums the fee notes, and refuses more than the reviewed fee', () => {
    expect(totalFeeOf([plan(0n, [], 2n), plan(0n, [], 3n)])).toBe(5n)
    expect(() => assertReviewedFee(6n, 5n)).toThrow(SpendFeeIncreasedError)
    expect(() => assertReviewedFee(5n, 5n)).not.toThrow()
  })
})
