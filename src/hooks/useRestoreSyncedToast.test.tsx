// ABOUTME: Tests for useRestoreSyncedToast — after a restore (backup file / pasted secret), one "Your balance is up to date"
// ABOUTME: toast once that wallet's balance is known; nothing for an ordinary sign-in, and nothing if it locks first.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'

const sonner = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: sonner }))

import { useRestoreSyncedToast } from './useRestoreSyncedToast'
import {
  activeShieldedWalletIdAtom,
  restoredWalletAwaitingBalanceAtom,
  shieldedUsdcAtom,
  shieldedWalletsAtom,
} from '@/state/wallet'
import type { ShieldedWalletState } from '@/lib/shielded/wallet'

function setup(opts: { restored: string | null }) {
  const store = createStore()
  store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'unlocked' } as ShieldedWalletState })
  store.set(activeShieldedWalletIdAtom, 'w1')
  store.set(restoredWalletAwaitingBalanceAtom, opts.restored)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useRestoreSyncedToast(), { wrapper })
  return store
}

beforeEach(() => sonner.mockClear())

describe('useRestoreSyncedToast (11F)', () => {
  it('toasts once the restored wallet\'s balance is known, then forgets it', () => {
    const store = setup({ restored: 'w1' })
    expect(sonner).not.toHaveBeenCalled()
    act(() => store.set(shieldedUsdcAtom, 0n))
    expect(sonner).toHaveBeenCalledWith('Your balance is up to date')
    expect(store.get(restoredWalletAwaitingBalanceAtom)).toBeNull()
    act(() => store.set(shieldedUsdcAtom, 5n))
    expect(sonner).toHaveBeenCalledTimes(1)
  })

  it('says nothing after an ordinary sign-in', () => {
    const store = setup({ restored: null })
    act(() => store.set(shieldedUsdcAtom, 0n))
    expect(sonner).not.toHaveBeenCalled()
  })

  it('forgets the restore without a toast if the wallet locks before its balance is known', () => {
    const store = setup({ restored: 'w1' })
    act(() => store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'locked' } as ShieldedWalletState }))
    expect(store.get(restoredWalletAwaitingBalanceAtom)).toBeNull()
    expect(sonner).not.toHaveBeenCalled()
  })
})
