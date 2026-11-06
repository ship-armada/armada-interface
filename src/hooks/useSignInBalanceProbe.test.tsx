// ABOUTME: Tests for useSignInBalanceProbe — times sign-in (wallet unlocked) to the first known SDK balance, tagged as a first
// ABOUTME: sync on this device or a returning one, into the Debug page's samples; one sample per sign-in.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'

const track = vi.hoisted(() => vi.fn())
vi.mock('@/lib/telemetry', () => ({ track }))

import { useSignInBalanceProbe } from './useSignInBalanceProbe'
import { activeShieldedWalletIdAtom, shieldedUsdcAtom, shieldedWalletsAtom } from '@/state/wallet'
import { signInLatencySamplesAtom } from '@/state/txTimings'
import type { ShieldedWalletState } from '@/lib/shielded/wallet'

function setup() {
  const store = createStore()
  store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'locked' } as ShieldedWalletState })
  store.set(activeShieldedWalletIdAtom, 'w1')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useSignInBalanceProbe(), { wrapper })
  const unlock = () => act(() => store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'unlocked' } as ShieldedWalletState }))
  return { store, unlock }
}

beforeEach(() => {
  vi.useFakeTimers()
  track.mockClear()
  window.localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('useSignInBalanceProbe', () => {
  it('records sign-in → first balance as a first sync when the wallet has no history checkpoint here', () => {
    const { store, unlock } = setup()
    unlock()
    act(() => vi.advanceTimersByTime(4_000))
    act(() => store.set(shieldedUsdcAtom, 0n))
    expect(store.get(signInLatencySamplesAtom)).toEqual([{ cold: true, durationMs: 4_000 }])
    expect(track).toHaveBeenCalledWith('sync.initial', { durationMs: 4_000, cold: true })
    // Later balance changes in the same session aren't sign-ins.
    act(() => store.set(shieldedUsdcAtom, 5n))
    expect(store.get(signInLatencySamplesAtom)).toHaveLength(1)
  })

  it('a wallet with a history checkpoint here counts as a returning sign-in', () => {
    window.localStorage.setItem('armada.shielded.historyScanBlock.w1', JSON.stringify({ block: 100, scannedAt: 1 }))
    const { store, unlock } = setup()
    unlock()
    act(() => vi.advanceTimersByTime(1_200))
    act(() => store.set(shieldedUsdcAtom, 0n))
    expect(store.get(signInLatencySamplesAtom)).toEqual([{ cold: false, durationMs: 1_200 }])
  })
})
