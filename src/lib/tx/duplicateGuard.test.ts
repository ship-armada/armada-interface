// ABOUTME: Tests for hasUnresolvedShield (S-L7) — flags same-amount deposits that may still be on-chain: in flight, expired,
// ABOUTME: timed out, or hit by a network error while sending (even with no hash heard back).

import { describe, it, expect } from 'vitest'
import { hasUnresolvedShield } from './duplicateGuard'
import type { TxError, TxExecutionState, TxRecord } from './types'

function shield(
  overrides: {
    state?: TxExecutionState
    amount?: bigint
    hash?: boolean
    error?: TxError
    kind?: 'shield' | 'shield-xchain'
    stage?: string
  } = {},
): TxRecord {
  const { state = 'failed', amount = 1_000_000n, hash = true, error, kind = 'shield', stage = 'submit-relayer' } = overrides
  return {
    id: 'x',
    kind,
    executionState: state,
    stage,
    stagesCompleted: ['build-proof'],
    updatedSeq: 1,
    createdAt: 0,
    updatedAt: 0,
    meta: { amount, feeCacheId: '', fromChainId: 31337 },
    artifacts: { ...(hash ? { sourceTxHash: '0xfeed' } : {}), ...(error ? { error } : {}) },
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as TxRecord
}

const POLL_TIMEOUT: TxError = { code: 'POLL_TIMEOUT', message: 'timed out', txHash: '0xfeed' }
const REVERTED: TxError = { code: 'TX_REVERTED', message: 'reverted', txHash: '0xfeed' }

describe('hasUnresolvedShield (S-L7)', () => {
  it('flags a POLL_TIMEOUT shield of the same amount (may be on-chain)', () => {
    expect(hasUnresolvedShield([shield({ state: 'failed', error: POLL_TIMEOUT })], 1_000_000n)).toBe(true)
  })

  it('flags an in-flight (waiting) same-amount shield — e.g. one backgrounded via S-M2', () => {
    expect(hasUnresolvedShield([shield({ state: 'waiting', error: undefined })], 1_000_000n)).toBe(true)
  })

  it('flags an expired-with-hash shield', () => {
    expect(hasUnresolvedShield([shield({ state: 'expired', error: undefined })], 1_000_000n)).toBe(true)
  })

  it('flags a shield hit by a network error after it broadcast (it may have landed)', () => {
    const rpc: TxError = { code: 'RPC_ERROR', message: 'x', txHash: '0xfeed' }
    expect(hasUnresolvedShield([shield({ state: 'failed', error: rpc, stage: 'hub-pending' })], 1_000_000n)).toBe(true)
  })

  it('flags a shield hit by a network error while sending, even with no hash heard back (the relayer may have broadcast)', () => {
    const rpc: TxError = { code: 'RPC_ERROR', message: 'x' }
    expect(hasUnresolvedShield([shield({ state: 'failed', error: rpc, hash: false })], 1_000_000n)).toBe(true)
  })

  it('does NOT flag a network error while the shield was still being built (nothing was sent)', () => {
    const rpc: TxError = { code: 'RPC_ERROR', message: 'x' }
    expect(hasUnresolvedShield([shield({ state: 'failed', error: rpc, hash: false, stage: 'build-proof' })], 1_000_000n)).toBe(false)
  })

  it('does NOT flag a TX_REVERTED shield (no deposit happened)', () => {
    expect(hasUnresolvedShield([shield({ state: 'failed', error: REVERTED })], 1_000_000n)).toBe(false)
  })

  it('does NOT flag a completed or cancelled shield', () => {
    expect(hasUnresolvedShield([shield({ state: 'completed', error: undefined })], 1_000_000n)).toBe(false)
    expect(hasUnresolvedShield([shield({ state: 'cancelled', error: undefined })], 1_000_000n)).toBe(false)
  })

  it('does NOT flag a record with no broadcast hash (nothing was sent)', () => {
    expect(hasUnresolvedShield([shield({ state: 'failed', error: POLL_TIMEOUT, hash: false })], 1_000_000n)).toBe(false)
  })

  it('only matches the SAME amount', () => {
    expect(hasUnresolvedShield([shield({ state: 'failed', error: POLL_TIMEOUT, amount: 2_000_000n })], 1_000_000n)).toBe(false)
  })

  it('covers shield-xchain deposits too', () => {
    expect(hasUnresolvedShield([shield({ kind: 'shield-xchain', state: 'failed', error: POLL_TIMEOUT })], 1_000_000n)).toBe(true)
  })

  it('ignores non-deposit kinds', () => {
    const unshield = { ...shield({ state: 'failed', error: POLL_TIMEOUT }), kind: 'unshield-local' } as TxRecord
    expect(hasUnresolvedShield([unshield], 1_000_000n)).toBe(false)
  })
})
