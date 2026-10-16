// ABOUTME: Pure tests for ARM allocation math — milestone position and direct/reserve totals.
// ABOUTME: Contract reads stay out of this file; they need Ethereum.

import { describe, expect, it } from 'vitest'
import { decodeStorageAddress, directLedgerRow, formatUsd, schedulePosition, summarizeAllocation } from './armAllocation'

const ether = (arm: number) => BigInt(arm) * 10n ** 18n

describe('formatUsd', () => {
  it('keeps small amounts exact and compacts large ones', () => {
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(950)).toBe('$950')
    expect(formatUsd(120_000)).toBe('$120K')
    expect(formatUsd(1_000_000)).toBe('$1M')
    expect(formatUsd(1_200_000)).toBe('$1.2M')
  })
})
describe('schedulePosition', () => {
  it('is 0 before the first milestone', () => {
    expect(schedulePosition(0)).toBe(0)
  })

  it('sits halfway from $0 to $10k at $5k', () => {
    expect(schedulePosition(5_000)).toBeCloseTo(100 / 12)
  })

  it('is 100 once revenue passes $1M', () => {
    expect(schedulePosition(2_000_000)).toBe(100)
  })
})

describe('decodeStorageAddress', () => {
  it('checksums the address in a storage word', () => {
    expect(decodeStorageAddress('0x000000000000000000000000b202c7b6d456fd1f9b6633bb3c42b5cc0f0a52f1')).toBe(
      '0xb202c7b6D456Fd1F9B6633bb3c42b5cC0F0A52F1',
    )
  })
})

describe('directLedgerRow', () => {
  it('unlocks a direct allocation by the current bps', () => {
    expect(directLedgerRow('0x1111111111111111111111111111111111111111', ether(60_000), 0n, 0n, 1_000n)).toMatchObject({
      source: 'direct',
      total: 60_000,
      unlocked: 6_000,
      claimed: 0,
      available: 0,
      locked: 54_000,
    })
  })
})

describe('summarizeAllocation', () => {
  it('reports no allocation when every balance is zero', () => {
    expect(
      summarizeAllocation({
        address: '0x1111111111111111111111111111111111111111',
        directAlloc: 0n,
        directReleased: 0n,
        directReleasable: 0n,
        resAssigned: 0n,
        resClaimed: 0n,
        resClaimable: 0n,
        resEffective: 0n,
        unlockBps: 0n,
      }).status,
    ).toBe('empty')
  })

  it('adds a direct allocation and a reserve grant, and unlocks by bps', () => {
    const found = summarizeAllocation({
      address: '0x1111111111111111111111111111111111111111',
      directAlloc: ether(40_000),
      directReleased: ether(1_000),
      directReleasable: ether(3_000),
      resAssigned: ether(20_000),
      resClaimed: ether(500),
      resClaimable: ether(1_500),
      resEffective: ether(20_000),
      unlockBps: 1_000n,
    })
    expect(found).toMatchObject({
      status: 'found',
      total: 60_000,
      unlocked: 6_000,
      available: 4_500,
      claimed: 1_500,
      locked: 54_000,
    })
  })
})
