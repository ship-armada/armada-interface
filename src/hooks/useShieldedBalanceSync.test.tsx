// ABOUTME: Tests for useShieldedBalanceSync — lock-reset (W-1), initial-load-only sync UI (no flicker),
// ABOUTME: read-not-sync on balance events (no sync amplification), and the held spends read with the balances (projected headline).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

// Shared handles so tests can drive the captured scan/balance listeners + assert on the SDK boundary.
const h = vi.hoisted(() => ({
  scanListener: null as ((s: { status: 'idle' | 'syncing' | 'complete' | 'failed'; progress: number }) => void) | null,
  balanceListener: null as (() => void) | null,
  refreshShieldedBalances: vi.fn(async () => {}),
  readSdkUsdcBalance: vi.fn(async () => ({ spendable: 0n, pending: 0n, pendingSpent: 0n })),
  readSdkYieldShares: vi.fn(async () => ({ position: 0n, pendingSpent: 0n })),
  readSdkHeldSpendTxids: vi.fn(async (): Promise<string[]> => []),
  readSdkSyncedThrough: vi.fn(async () => 0),
}))

// Mock the SDK boundary so importing the hook doesn't pull the SDK into jsdom, and so we can
// capture the scan-status + balance-update listeners the hook subscribes.
vi.mock('@/lib/shielded/sync', () => ({
  subscribeBalanceUpdates: vi.fn(async (cb: () => void) => {
    h.balanceListener = cb
    return () => { h.balanceListener = null }
  }),
  subscribeScanStatus: vi.fn((cb: (s: { status: 'idle' | 'syncing' | 'complete' | 'failed'; progress: number }) => void) => {
    h.scanListener = cb
    return () => { h.scanListener = null }
  }),
  refreshShieldedBalances: h.refreshShieldedBalances,
}))
vi.mock('@/lib/shielded/sdk-read', () => ({
  closeSdkRead: vi.fn(async () => {}),
  readSdkUsdcBalance: h.readSdkUsdcBalance,
  readSdkYieldShares: h.readSdkYieldShares,
  readSdkHeldSpendTxids: h.readSdkHeldSpendTxids,
  readSdkSyncedThrough: h.readSdkSyncedThrough,
}))

import { useShieldedBalanceSync } from './useShieldedBalanceSync'
import {
  shieldedWalletsAtom,
  activeShieldedWalletIdAtom,
  heldSpendTxidsAtom,
  scannedThroughAtom,
  shieldedUsdcAtom,
  shieldedUsdcSpendableAtom,
  syncStateAtom,
  yieldSharesAtom,
} from '@/state/wallet'
import { shieldedUsdcHeadlineAtom, yieldSharesHeadlineAtom } from '@/state/balanceProjection'
import { txListAtom } from '@/state/tx'
import type { TxRecord } from '@/lib/tx/types'

function Harness() {
  useShieldedBalanceSync()
  return null
}

function unlockedStore() {
  const store = createStore()
  store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'unlocked' } })
  store.set(activeShieldedWalletIdAtom, 'w1')
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  h.scanListener = null
  h.balanceListener = null
})

describe('useShieldedBalanceSync — W-1 sync reset', () => {
  it('resets sync state to idle when no wallet is unlocked (lock / account switch)', () => {
    // WHY (W-1): after wallet A's scan completes, syncStateAtom is 'complete'. On lock/switch we
    // must reset it — otherwise wallet B inherits 'complete', so its dashboard renders ungated
    // with a null balance and enabled spend buttons until B's first scan event. The locked branch
    // must also drop the stale balance.
    const store = createStore()
    store.set(syncStateAtom, { status: 'complete', progress: 1 })
    store.set(shieldedUsdcAtom, 5_000_000n)
    store.set(heldSpendTxidsAtom, ['0xheld'])
    store.set(scannedThroughAtom, 120)
    store.set(shieldedWalletsAtom, {})
    store.set(activeShieldedWalletIdAtom, null)

    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )

    expect(store.get(syncStateAtom)).toEqual({ status: 'idle', progress: 0 })
    expect(store.get(shieldedUsdcAtom)).toBeNull()
    expect(store.get(shieldedUsdcHeadlineAtom)).toBeNull()
    expect(store.get(yieldSharesHeadlineAtom)).toBeNull()
    expect(store.get(heldSpendTxidsAtom)).toEqual([])
    expect(store.get(scannedThroughAtom)).toBeNull()
  })
})

describe('useShieldedBalanceSync — initial-load-only sync UI (flicker fix)', () => {
  it('reflects the initial scan, then pins to complete so background syncs do not revert the UI', () => {
    const store = unlockedStore()
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )
    expect(h.scanListener).toBeTypeOf('function')

    // Initial load surfaces the full progress lifecycle.
    act(() => h.scanListener!({ status: 'syncing', progress: 0 }))
    expect(store.get(syncStateAtom)).toEqual({ status: 'syncing', progress: 0 })
    act(() => h.scanListener!({ status: 'syncing', progress: 0.5 }))
    expect(store.get(syncStateAtom).progress).toBe(0.5)
    act(() => h.scanListener!({ status: 'complete', progress: 1 }))
    expect(store.get(syncStateAtom)).toEqual({ status: 'complete', progress: 1 })

    // WHY (flicker fix): the 15s poll re-syncs and fires scan:started again on every tick. That MUST
    // NOT revert syncStateAtom to 'syncing' — else BalanceHero/SyncBanner replace the balance with
    // the "Loading your private balance" block a couple times a second.
    act(() => h.scanListener!({ status: 'syncing', progress: 0 }))
    expect(store.get(syncStateAtom)).toEqual({ status: 'complete', progress: 1 })
    act(() => h.scanListener!({ status: 'complete', progress: 1 }))
    expect(store.get(syncStateAtom)).toEqual({ status: 'complete', progress: 1 })
  })
})

describe('useShieldedBalanceSync — read-not-sync on balance events (amplification fix)', () => {
  it('reads balances on a balance-bus ping without triggering another wallet.sync()', async () => {
    const store = unlockedStore()
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )

    // The initial unlock triggers exactly ONE intentional sync.
    await waitFor(() => expect(h.refreshShieldedBalances).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(h.balanceListener).toBeTypeOf('function'))
    h.readSdkUsdcBalance.mockClear()
    h.readSdkYieldShares.mockClear()

    // A balance-bus ping fires BECAUSE a poll's sync just completed. The handler must READ the scan
    // state, not kick off another sync — otherwise each sync re-triggers a sync (self-sustaining
    // cascade → the "constant sdk.sync tick").
    await act(async () => {
      h.balanceListener!()
    })
    await waitFor(() => expect(h.readSdkUsdcBalance).toHaveBeenCalled())
    expect(h.readSdkYieldShares).toHaveBeenCalled()
    expect(h.refreshShieldedBalances).toHaveBeenCalledTimes(1) // still just the initial sync
  })
})

describe('useShieldedBalanceSync — the projected headline (3B)', () => {
  it("reads the held spends with the balances; the headline adds a held send's change, the spend atoms don't", async () => {
    // WHY: once a spend broadcasts, the SDK holds its input notes until the Nullified event is scanned, and its change
    // note isn't visible until then either — so spendable + pending alone dips below what the user will have. The
    // headline adds the held spend's recorded change (the balance after the send); Max / the "pending" suffix keep
    // reading the unchanged atoms.
    h.readSdkUsdcBalance.mockResolvedValue({ spendable: 20n, pending: 5n, pendingSpent: 100n })
    h.readSdkYieldShares.mockResolvedValue({ position: 40n, pendingSpent: 0n })
    h.readSdkHeldSpendTxids.mockResolvedValue(['0xsend'])
    h.readSdkSyncedThrough.mockResolvedValue(321)
    const store = unlockedStore()
    store.set(txListAtom, [
      {
        id: 'send',
        kind: 'transfer-shielded',
        executionState: 'active',
        meta: {},
        artifacts: { sourceTxHash: '0xsend', returnsToSelf: 16n },
        walletContext: { shieldedWalletId: 'w1' },
      } as unknown as TxRecord,
    ])
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )

    await waitFor(() => expect(store.get(shieldedUsdcHeadlineAtom)).toBe(41n)) // 25 scanned + 16 change
    expect(store.get(heldSpendTxidsAtom)).toEqual(['0xsend'])
    expect(store.get(scannedThroughAtom)).toBe(321)
    expect(store.get(shieldedUsdcAtom)).toBe(25n)
    expect(store.get(shieldedUsdcSpendableAtom)).toBe(20n)
    expect(store.get(yieldSharesHeadlineAtom)).toBe(40n)
    expect(store.get(yieldSharesAtom)).toBe(40n)
  })
})
