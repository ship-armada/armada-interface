// ABOUTME: Tests for useCloseFlowsOnLock — when the wallet locks under an open flow, receipt or activity panel, they close
// ABOUTME: (the app shell stays mounted while locked); Settings is left open.

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { useCloseFlowsOnLock } from './useCloseFlowsOnLock'
import { activityPanelOpenAtom, openModalAtom, receiptTxIdAtom, type ModalKind } from '@/state/ui'
import { activeShieldedWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'
import type { ShieldedWalletState } from '@/lib/shielded/wallet'

function setup(open: ModalKind) {
  const store = createStore()
  store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'unlocked' } as ShieldedWalletState })
  store.set(activeShieldedWalletIdAtom, 'w1')
  store.set(openModalAtom, open)
  store.set(receiptTxIdAtom, 'tx1')
  store.set(activityPanelOpenAtom, true)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useCloseFlowsOnLock(), { wrapper })
  const lock = () => act(() => store.set(shieldedWalletsAtom, { w1: { id: 'w1', status: 'locked' } as ShieldedWalletState }))
  return { store, lock }
}

describe('useCloseFlowsOnLock', () => {
  it('closes an open flow, the receipt and the activity panel when the wallet locks', () => {
    const { store, lock } = setup('payment')
    lock()
    expect(store.get(openModalAtom)).toBeNull()
    expect(store.get(receiptTxIdAtom)).toBeNull()
    expect(store.get(activityPanelOpenAtom)).toBe(false)
  })

  it('leaves Settings open (its "Lock now" locks from there)', () => {
    const { store, lock } = setup('settings')
    lock()
    expect(store.get(openModalAtom)).toBe('settings')
  })

  it('does nothing while the wallet stays unlocked', () => {
    const { store } = setup('shield')
    expect(store.get(openModalAtom)).toBe('shield')
  })
})
