// ABOUTME: Tests for a cross-chain unshield's delivery reconcile — Circle's actual CCTP fee (from the relayer's delivery
// ABOUTME: status, or the destination MessageReceived body) replaces the review-time estimate and clears its est. marker.

import { describe, it, expect } from 'vitest'
import { deliveredCctpFee, deliveredUnshieldMeta } from './reconcile'
import { C_ACTUAL } from '@/test/fixtures/txValues'

/** A BurnMessage body with `amount` at byte 68 and `feeExecuted` at byte 164 (the layout `readBurnMessage` reads). */
function burnMessageBody(amount: bigint, feeExecuted: bigint): `0x${string}` {
  const bytes = new Array<string>(196).fill('00')
  const put = (offset: number, value: bigint) => {
    const hex = value.toString(16).padStart(64, '0')
    for (let i = 0; i < 32; i++) bytes[offset + i] = hex.slice(i * 2, i * 2 + 2)
  }
  put(68, amount)
  put(164, feeExecuted)
  return `0x${bytes.join('')}`
}

describe('deliveredCctpFee', () => {
  it('takes the fee the relayer\'s delivery status reports', () => {
    expect(deliveredCctpFee({ feeExecuted: '150001' })).toBe(C_ACTUAL)
  })

  it('reads it from the destination MessageReceived body when the relayer status isn\'t available (the on-chain fallback)', () => {
    expect(deliveredCctpFee({ messageBody: burnMessageBody(10_000_000n, C_ACTUAL) })).toBe(C_ACTUAL)
  })

  it('is unknown when neither carries it (or the value is malformed)', () => {
    expect(deliveredCctpFee({})).toBeUndefined()
    expect(deliveredCctpFee({ feeExecuted: 'not-a-number' })).toBeUndefined()
    expect(deliveredCctpFee({ messageBody: '0x1234' })).toBeUndefined()
  })
})

describe('deliveredUnshieldMeta', () => {
  it('the actual fee replaces the estimate and is no longer marked est. (D4, #68)', () => {
    expect(deliveredUnshieldMeta(C_ACTUAL)).toEqual({ cctpFee: C_ACTUAL, cctpFeeIsEstimate: false })
  })

  it('an unknown fee leaves the estimate — still marked', () => {
    expect(deliveredUnshieldMeta(undefined)).toEqual({})
  })
})
