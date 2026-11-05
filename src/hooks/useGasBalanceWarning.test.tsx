// ABOUTME: Tests for useGasBalanceWarning — the direct shield's ETH check: short when the wallet holds less than the
// ABOUTME: estimated gas (4F), or less than a fixed floor while there's no estimate yet; quiet while disconnected / loading.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const wagmi = vi.hoisted(() => ({
  account: { address: '0xabc' as string | undefined, isConnected: true },
  balance: { value: 0n, symbol: 'ETH' } as { value: bigint; symbol: string } | undefined,
}))
vi.mock('wagmi', () => ({
  useAccount: () => wagmi.account,
  useBalance: () => ({ data: wagmi.balance }),
}))

import { useGasBalanceWarning } from './useGasBalanceWarning'

beforeEach(() => {
  wagmi.account = { address: '0xabc', isConnected: true }
})

describe('useGasBalanceWarning', () => {
  it('is short when the balance is below the estimated gas, and fine at or above it (4F)', () => {
    wagmi.balance = { value: 900_000_000_000_000n, symbol: 'ETH' }
    expect(renderHook(() => useGasBalanceWarning(31337, 1_000_000_000_000_000n)).result.current).toMatchObject({
      show: true,
      formattedNeeded: '0.001',
    })
    expect(renderHook(() => useGasBalanceWarning(31337, 800_000_000_000_000n)).result.current.show).toBe(false)
  })

  it('falls back to a fixed floor while there is no estimate', () => {
    wagmi.balance = { value: 100_000_000_000_000n, symbol: 'ETH' }
    expect(renderHook(() => useGasBalanceWarning(31337, null)).result.current.show).toBe(true)
    wagmi.balance = { value: 600_000_000_000_000n, symbol: 'ETH' }
    expect(renderHook(() => useGasBalanceWarning(31337, null)).result.current.show).toBe(false)
  })

  it('says nothing while disconnected or before the balance loads', () => {
    wagmi.balance = undefined
    expect(renderHook(() => useGasBalanceWarning(31337, 1n)).result.current.show).toBe(false)
  })
})
