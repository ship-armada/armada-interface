// ABOUTME: Tests for deliveredShieldMeta — what a cross-chain shield's record takes from its hub delivery: the true
// ABOUTME: deposit and Circle's actual CCTP fee, which replaces the review-time estimate (and clears its est. marker).

import { describe, it, expect } from 'vitest'
import { deliveredShieldMeta } from './reconcile'
import { A, C_ACTUAL } from '@/test/fixtures/txValues'

describe('deliveredShieldMeta', () => {
  it('takes the burn amount and the actual CCTP fee, which is no longer an estimate', () => {
    expect(deliveredShieldMeta({ received: { burnAmount: A, cctpFee: C_ACTUAL } } as never))
      .toEqual({ amount: A, cctpFee: C_ACTUAL, cctpFeeIsEstimate: false })
  })

  it('keeps the estimate (and its marker) when the delivery carries no CCTP fee', () => {
    expect(deliveredShieldMeta({ received: { burnAmount: A } } as never)).toEqual({ amount: A })
    expect(deliveredShieldMeta({})).toEqual({})
  })
})
