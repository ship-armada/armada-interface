// ABOUTME: Tests for lib/tx/errorCopy — category copy resolution, and the TX_REVERTED body that admits the network fee was
// ABOUTME: spent when the user's own wallet sent the reverted tx (direct-path shield), via userPaidNetworkFee.

import { describe, it, expect } from 'vitest'
import { resolveTxErrorCopy, userPaidNetworkFee } from './errorCopy'
import type { TxRecord } from './types'

const reverted = { code: 'TX_REVERTED' as const, message: 'execution reverted', txHash: '0x01' as `0x${string}` }

function rec(kind: TxRecord['kind'], meta: object = {}): TxRecord {
  return { kind, meta } as unknown as TxRecord
}

describe('resolveTxErrorCopy', () => {
  it('says no funds moved for a reverted relayer-submitted tx (the relayer paid the gas)', () => {
    expect(resolveTxErrorCopy(reverted).body).toMatch(/No funds were moved/)
  })

  it('admits the network fee was spent when the user paid it (7D)', () => {
    const { title, body } = resolveTxErrorCopy(reverted, undefined, { userPaidNetworkFee: true })
    expect(title).toBe('Transaction failed on chain')
    expect(body).toBe(
      "The network mined your transaction but the contract reverted. Your USDC didn't move, but the network fee was spent.",
    )
  })

  it('leaves other codes unchanged by the option', () => {
    const rejected = { code: 'USER_REJECTED' as const, message: 'x' }
    expect(resolveTxErrorCopy(rejected, undefined, { userPaidNetworkFee: true })).toEqual(resolveTxErrorCopy(rejected))
  })

  it('falls back to the message, then the fallback, when a code has no stock body', () => {
    expect(resolveTxErrorCopy({ code: 'OTHER', message: 'boom' }).body).toBe('boom')
    expect(resolveTxErrorCopy(null, 'fallback').body).toBe('fallback')
  })
})

describe('userPaidNetworkFee', () => {
  it('is true for a shield / cross-chain shield sent from the user\'s wallet (direct path)', () => {
    expect(userPaidNetworkFee(rec('shield', {}))).toBe(true)
    expect(userPaidNetworkFee(rec('shield-xchain', { useGasless: false }))).toBe(true)
  })

  it('is false on the gasless path and for every relayer-submitted spend', () => {
    expect(userPaidNetworkFee(rec('shield', { useGasless: true }))).toBe(false)
    expect(userPaidNetworkFee(rec('shield-xchain', { useGasless: true }))).toBe(false)
    for (const kind of ['transfer-shielded', 'unshield-local', 'unshield-xchain', 'yield-deposit', 'yield-withdraw', 'consolidate'] as const) {
      expect(userPaidNetworkFee(rec(kind))).toBe(false)
    }
  })

  it('is false without a record', () => {
    expect(userPaidNetworkFee(null)).toBe(false)
  })
})
