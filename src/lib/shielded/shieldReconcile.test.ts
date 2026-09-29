// ABOUTME: Tests for shieldFeesFromHistory — what a confirmed shield's record takes from the SDK's history entry for its hub
// ABOUTME: tx: the pool's actual protocol fee (clearing an estimate's marker) and the relayer fee paid.

import { describe, it, expect } from 'vitest'
import { shieldFeesFromHistory } from './shieldReconcile'
import { F, P } from '@/test/fixtures/txValues'

describe('shieldFeesFromHistory', () => {
  it('the actual protocol fee replaces the review value (and any estimate marker); the relayer fee paid, when there was one', () => {
    expect(shieldFeesFromHistory({ shieldFee: P, broadcasterFee: F } as never)).toEqual({ protocolFee: P, protocolFeeIsEstimate: false, feeAmount: F })
    expect(shieldFeesFromHistory({ shieldFee: P } as never)).toEqual({ protocolFee: P, protocolFeeIsEstimate: false })
  })

  it('no entry (the scan hasn\'t caught up, or the wallet is locked): the review values stay', () => {
    expect(shieldFeesFromHistory(undefined)).toEqual({})
  })
})
