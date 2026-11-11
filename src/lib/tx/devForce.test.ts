// ABOUTME: Unit tests for throwIfForcedError — no-op unless meta.devForceError is set, else throws a branded TxError carrying that code.

import { describe, it, expect } from 'vitest'
import { throwIfForcedError } from './devForce'
import { extractTxError } from './receipt'
import type { TxErrorCode, TxRecord } from './types'

function rec(devForceError?: TxErrorCode): TxRecord {
  return {
    meta: { amount: 1_000_000n, feeCacheId: 'fc', ...(devForceError ? { devForceError } : {}) },
    artifacts: {},
  } as unknown as TxRecord
}

describe('throwIfForcedError', () => {
  it('is a no-op when devForceError is unset (normal submit)', () => {
    expect(() => throwIfForcedError(rec())).not.toThrow()
  })

  it.each(['TX_REVERTED', 'USER_REJECTED'] as const)('throws a branded TxError carrying the forced code (%s)', (code) => {
    let caught: unknown
    try {
      throwIfForcedError(rec(code))
    } catch (err) {
      caught = err
    }
    expect(extractTxError(caught)?.code).toBe(code)
  })
})
