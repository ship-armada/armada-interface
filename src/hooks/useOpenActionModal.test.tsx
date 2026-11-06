// ABOUTME: Tests useOpenActionModal — the one way into a flow: connect when disconnected, sign in when locked (the action
// ABOUTME: queued to resume after unlock), straight in when unlocked; called with no flow it just signs in.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { useOpenActionModal } from './useOpenActionModal'
import { openModalAtom, signInResumeAtom } from '@/state/ui'
import { activeShieldedWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'
import type { ShieldedWalletState } from '@/lib/shielded/wallet'

const openConnectModal = vi.fn()

let isConnected = false

vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected }),
}))

vi.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: () => ({ openConnectModal }),
}))

function setup(status: 'locked' | 'unlocked' | 'missing') {
  const store = createStore()
  if (status !== 'missing') {
    store.set(shieldedWalletsAtom, { w1: { id: 'w1', status } as ShieldedWalletState })
    store.set(activeShieldedWalletIdAtom, 'w1')
  }
  const hook = renderHook(() => useOpenActionModal(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  })
  return { store, ...hook }
}

describe('useOpenActionModal', () => {
  beforeEach(() => {
    isConnected = false
    openConnectModal.mockClear()
  })

  it('opens the flow straight away when connected and signed in', () => {
    isConnected = true
    const { store, result } = setup('unlocked')
    act(() => result.current('payment'))
    expect(openConnectModal).not.toHaveBeenCalled()
    expect(store.get(openModalAtom)).toBe('payment')
  })

  it('when connected but locked, opens sign-in with the flow queued to resume after unlock', () => {
    isConnected = true
    const { store, result } = setup('locked')
    act(() => result.current('shield'))
    expect(store.get(openModalAtom)).toBe('sign-in')
    expect(store.get(signInResumeAtom)).toBe('shield')
  })

  it('a first visit (no wallet on this device) signs in the same way', () => {
    isConnected = true
    const { store, result } = setup('missing')
    act(() => result.current('request'))
    expect(store.get(openModalAtom)).toBe('sign-in')
    expect(store.get(signInResumeAtom)).toBe('request')
  })

  it("with no flow, just signs in (the sign-in card's button)", () => {
    isConnected = true
    const { store, result } = setup('locked')
    act(() => result.current())
    expect(store.get(openModalAtom)).toBe('sign-in')
    expect(store.get(signInResumeAtom)).toBeNull()
  })

  it('when disconnected, connects first — then signs in once the wallet connects', () => {
    const { store, result, rerender } = setup('locked')
    act(() => result.current('yield-withdraw'))
    expect(openConnectModal).toHaveBeenCalled()
    expect(store.get(openModalAtom)).toBeNull()

    isConnected = true
    rerender()

    expect(store.get(openModalAtom)).toBe('sign-in')
    expect(store.get(signInResumeAtom)).toBe('yield-withdraw')
  })

  it('when disconnected but already signed in (a restored wallet), opens the flow once the wallet connects', () => {
    const { store, result, rerender } = setup('unlocked')
    act(() => result.current('shield'))
    expect(store.get(openModalAtom)).toBeNull()

    isConnected = true
    rerender()

    expect(store.get(openModalAtom)).toBe('shield')
  })
})
