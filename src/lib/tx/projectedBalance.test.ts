// ABOUTME: Tests for projectedBalance — what in-flight transactions add to the scanned balance until it catches up (3B): a
// ABOUTME: held spend's change (exactly while the SDK holds it), per token, and a same-chain shield's note until it's scanned.

import { describe, it, expect } from 'vitest'
import type { TxRecord } from './types'
import { projectedBalance } from './projectedBalance'

const HASH = `0x${'ab'.repeat(32)}` as const
const OTHER = `0x${'cd'.repeat(32)}` as const

function spend(kind: TxRecord['kind'], returnsToSelf: bigint | undefined, hash: `0x${string}` | null = HASH, meta: Record<string, unknown> = {}): TxRecord {
  return {
    id: `${kind}-${hash ?? 'none'}`,
    kind,
    executionState: 'active',
    meta,
    artifacts: { ...(hash !== null ? { sourceTxHash: hash } : {}), ...(returnsToSelf !== undefined ? { returnsToSelf } : {}) },
  } as unknown as TxRecord
}

describe('projectedBalance — spends', () => {
  it("adds a held send's change: the balance after the send, from broadcast", () => {
    const p = projectedBalance({ records: [spend('transfer-shielded', 16_000_000n)], heldTxids: [HASH], syncedThrough: 0 })
    expect(p).toEqual({ usdc: 16_000_000n, shares: 0n, confirming: true })
  })

  it('stops the moment the SDK releases the hold — the same read that scans the change note', () => {
    expect(projectedBalance({ records: [spend('transfer-shielded', 16_000_000n)], heldTxids: [], syncedThrough: 0 })).toEqual({
      usdc: 0n,
      shares: 0n,
      confirming: false,
    })
  })

  it('matches the held txid whatever its case', () => {
    expect(projectedBalance({ records: [spend('unshield-local', 5n)], heldTxids: [HASH.toUpperCase().replace('0X', '0x')], syncedThrough: 0 }).usdc).toBe(5n)
  })

  it('sums overlapping spends, each only while it is held', () => {
    const records = [spend('transfer-shielded', 10n, HASH), spend('unshield-xchain', 3n, OTHER)]
    expect(projectedBalance({ records, heldTxids: [HASH, OTHER], syncedThrough: 0 }).usdc).toBe(13n)
    expect(projectedBalance({ records, heldTxids: [OTHER], syncedThrough: 0 }).usdc).toBe(3n)
  })

  it('a vault withdrawal returns shares; a vault deposit returns USDC', () => {
    const records = [spend('yield-withdraw', 7n, HASH), spend('yield-deposit', 2n, OTHER)]
    expect(projectedBalance({ records, heldTxids: [HASH, OTHER], syncedThrough: 0 })).toEqual({ usdc: 2n, shares: 7n, confirming: true })
  })

  it("a merge returns the merged notes in the merged token", () => {
    const usdcMerge = spend('consolidate', 29n, HASH, { tokenSymbol: 'USDC' })
    const sharesMerge = spend('consolidate', 40n, OTHER, { tokenSymbol: 'Vault shares' })
    expect(projectedBalance({ records: [usdcMerge, sharesMerge], heldTxids: [HASH, OTHER], syncedThrough: 0 })).toEqual({ usdc: 29n, shares: 40n, confirming: true })
  })

  it('a held spend that returns nothing (it spent everything) is still confirming', () => {
    expect(projectedBalance({ records: [spend('unshield-local', 0n)], heldTxids: [HASH], syncedThrough: 0 })).toEqual({ usdc: 0n, shares: 0n, confirming: true })
  })

  it('ignores spends not yet broadcast, and records with nothing recorded', () => {
    expect(projectedBalance({ records: [spend('transfer-shielded', 9n, null)], heldTxids: [HASH], syncedThrough: 0 }).confirming).toBe(false)
    expect(projectedBalance({ records: [spend('transfer-shielded', undefined)], heldTxids: [HASH], syncedThrough: 0 })).toEqual({ usdc: 0n, shares: 0n, confirming: true })
  })
})

function shield(executionState: TxRecord['executionState'], hubBlock?: number, hash: `0x${string}` | null = HASH): TxRecord {
  return {
    id: `shield-${executionState}`,
    kind: 'shield',
    executionState,
    // 100 in, a 1 relayer fee and a 0.5 protocol fee → a 98.5 note.
    meta: { amount: 100_000_000n, feeAmount: 1_000_000n, protocolFee: 500_000n },
    artifacts: { ...(hash !== null ? { sourceTxHash: hash } : {}), ...(hubBlock !== undefined ? { hubBlock } : {}) },
  } as unknown as TxRecord
}

describe('projectedBalance — incoming same-chain shields', () => {
  it("adds the shield's note (what the receipt says you'll receive) from broadcast", () => {
    expect(projectedBalance({ records: [shield('active')], heldTxids: [], syncedThrough: 90 })).toEqual({
      usdc: 98_500_000n,
      shares: 0n,
      confirming: true,
    })
  })

  it("keeps counting once its block is known, until the SDK's scan reaches that block — the read the note joins the balance", () => {
    expect(projectedBalance({ records: [shield('active', 100)], heldTxids: [], syncedThrough: 99 }).usdc).toBe(98_500_000n)
    expect(projectedBalance({ records: [shield('active', 100)], heldTxids: [], syncedThrough: 100 }).usdc).toBe(0n)
    expect(projectedBalance({ records: [shield('completed', 100)], heldTxids: [], syncedThrough: 99 }).usdc).toBe(98_500_000n)
    expect(projectedBalance({ records: [shield('completed', 100)], heldTxids: [], syncedThrough: 100 }).confirming).toBe(false)
  })

  it("doesn't count a shield that failed, was cancelled or ran out of time, one not yet broadcast, or old history", () => {
    for (const state of ['failed', 'cancelled', 'expired'] as const) {
      expect(projectedBalance({ records: [shield(state, 100)], heldTxids: [], syncedThrough: 0 }).confirming).toBe(false)
    }
    expect(projectedBalance({ records: [shield('active', undefined, null)], heldTxids: [], syncedThrough: 0 }).confirming).toBe(false)
    // A completed shield with no recorded block (history, or recovered from chain) is already in the scanned balance.
    expect(projectedBalance({ records: [shield('completed')], heldTxids: [], syncedThrough: 0 }).confirming).toBe(false)
  })

  it('before the first read of the scan position, a confirmed shield keeps counting', () => {
    expect(projectedBalance({ records: [shield('completed', 100)], heldTxids: [], syncedThrough: null }).usdc).toBe(98_500_000n)
  })
})
