// ABOUTME: Local-dev-only mock unshielded USDC balance for deposit UI testing. Persisted in localStorage; ignored outside local mode.
// ABOUTME: useBalances applies the override to every chain when enabled — real on-chain balance is unchanged.

import { atomWithStorage } from 'jotai/utils'

export interface DevMockBalanceValue {
  enabled: boolean
  /** Human-readable USDC amount (e.g. "1000") for the Debug panel input. */
  amountUsdc: string
}

export const DEFAULT_DEV_MOCK_BALANCE: DevMockBalanceValue = {
  enabled: false,
  amountUsdc: '1000',
}

export const devMockBalanceAtom = atomWithStorage<DevMockBalanceValue>(
  'armada-interface.devMockBalance',
  DEFAULT_DEV_MOCK_BALANCE,
)
