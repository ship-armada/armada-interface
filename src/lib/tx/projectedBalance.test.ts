// ABOUTME: Tests for projectedBalance — what in-flight transactions add to the scanned balance until it catches up (3B): a
// ABOUTME: held spend's change (exactly while the SDK holds it), per token; nothing once released, dropped or never recorded.

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
    const p = projectedBalance({ records: [spend('transfer-shielded', 16_000_000n)], heldTxids: [HASH] })
    expect(p).toEqual({ usdc: 16_000_000n, shares: 0n, confirming: true })
  })

  it('stops the moment the SDK releases the hold — the same read that scans the change note', () => {
    expect(projectedBalance({ records: [spend('transfer-shielded', 16_000_000n)], heldTxids: [] })).toEqual({
      usdc: 0n,
      shares: 0n,
      confirming: false,
    })
  })

  it('matches the held txid whatever its case', () => {
    expect(projectedBalance({ records: [spend('unshield-local', 5n)], heldTxids: [HASH.toUpperCase().replace('0X', '0x')] }).usdc).toBe(5n)
  })

  it('sums overlapping spends, each only while it is held', () => {
    const records = [spend('transfer-shielded', 10n, HASH), spend('unshield-xchain', 3n, OTHER)]
    expect(projectedBalance({ records, heldTxids: [HASH, OTHER] }).usdc).toBe(13n)
    expect(projectedBalance({ records, heldTxids: [OTHER] }).usdc).toBe(3n)
  })

  it('a vault withdrawal returns shares; a vault deposit returns USDC', () => {
    const records = [spend('yield-withdraw', 7n, HASH), spend('yield-deposit', 2n, OTHER)]
    expect(projectedBalance({ records, heldTxids: [HASH, OTHER] })).toEqual({ usdc: 2n, shares: 7n, confirming: true })
  })

  it("a merge returns the merged notes in the merged token", () => {
    const usdcMerge = spend('consolidate', 29n, HASH, { tokenSymbol: 'USDC' })
    const sharesMerge = spend('consolidate', 40n, OTHER, { tokenSymbol: 'Vault shares' })
    expect(projectedBalance({ records: [usdcMerge, sharesMerge], heldTxids: [HASH, OTHER] })).toEqual({ usdc: 29n, shares: 40n, confirming: true })
  })

  it('a held spend that returns nothing (it spent everything) is still confirming', () => {
    expect(projectedBalance({ records: [spend('unshield-local', 0n)], heldTxids: [HASH] })).toEqual({ usdc: 0n, shares: 0n, confirming: true })
  })

  it('ignores spends not yet broadcast, and records with nothing recorded', () => {
    expect(projectedBalance({ records: [spend('transfer-shielded', 9n, null)], heldTxids: [HASH] }).confirming).toBe(false)
    expect(projectedBalance({ records: [spend('transfer-shielded', undefined)], heldTxids: [HASH] })).toEqual({ usdc: 0n, shares: 0n, confirming: true })
  })
})
