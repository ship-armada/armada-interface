// ABOUTME: Unit tests for accruedVaultYieldRaw — vault yield = current value − net capital contributed.

import { describe, it, expect } from 'vitest'
import { accruedVaultYieldRaw } from './vaultEarnings'
import type { TxRecord } from '@/lib/tx/types'

/** Minimal settled yield record — only the fields accruedVaultYieldRaw reads. */
function yieldRec(
  kind: 'yield-deposit' | 'yield-withdraw',
  amount: bigint,
  executionState: TxRecord['executionState'] = 'completed',
): TxRecord {
  return { kind, executionState, meta: { amount } } as unknown as TxRecord
}

const shieldRec = (): TxRecord =>
  ({ kind: 'shield', executionState: 'completed', meta: { amount: 9_000_000n } } as unknown as TxRecord)

describe('accruedVaultYieldRaw', () => {
  it('deposit-only: earned = current value − deposited principal', () => {
    // Deposited 1.0, vault now worth 1.05 → 0.05 earned.
    expect(accruedVaultYieldRaw([yieldRec('yield-deposit', 1_000_000n)], 1_050_000n)).toBe(50_000n)
  })

  it('nets withdrawals out of contributed capital', () => {
    // Deposited 2.0, withdrew 1.0 (net 1.0 in), vault now 1.1 → 0.1 earned.
    const records = [yieldRec('yield-deposit', 2_000_000n), yieldRec('yield-withdraw', 1_000_000n)]
    expect(accruedVaultYieldRaw(records, 1_100_000n)).toBe(100_000n)
  })

  it('clamps to 0 rather than showing a negative "earned" (rate/rounding wobble)', () => {
    expect(accruedVaultYieldRaw([yieldRec('yield-deposit', 1_000_000n)], 990_000n)).toBe(0n)
  })

  it('counts only completed records — a pending/failed deposit does not distort the net', () => {
    const records = [
      yieldRec('yield-deposit', 1_000_000n, 'completed'),
      yieldRec('yield-deposit', 5_000_000n, 'pending'),
      yieldRec('yield-withdraw', 3_000_000n, 'failed'),
    ]
    // Only the 1.0 completed deposit counts → earned = 1.05 − 1.0 = 0.05.
    expect(accruedVaultYieldRaw(records, 1_050_000n)).toBe(50_000n)
  })

  it('ignores non-yield kinds', () => {
    expect(accruedVaultYieldRaw([shieldRec(), yieldRec('yield-deposit', 1_000_000n)], 1_020_000n)).toBe(20_000n)
  })

  it('is 0 with no vault activity', () => {
    expect(accruedVaultYieldRaw([], 0n)).toBe(0n)
  })
})
