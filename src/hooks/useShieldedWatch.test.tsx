// ABOUTME: Tests for useShieldedWatch — starts wallet.watch() when unlocked+visible, unsubscribes on
// ABOUTME: teardown, and stays idle when locked or the tab is hidden.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { shieldedWalletsAtom, activeShieldedWalletIdAtom } from '@/state/wallet'
import { tabVisibleAtom } from '@/state/visibility'

const hoisted = vi.hoisted(() => ({
  watch: vi.fn(),
  unsubscribe: vi.fn(),
  getSdkWallet: vi.fn(),
}))
vi.mock('@/lib/shielded/sdk-read', () => ({ getSdkWallet: hoisted.getSdkWallet }))

import { useShieldedWatch } from './useShieldedWatch'

function Harness() {
  useShieldedWatch()
  return null
}

function makeStore(opts: { unlocked: boolean; tabVisible?: boolean }) {
  const store = createStore()
  store.set(shieldedWalletsAtom, {
    'rg-1': { id: 'rg-1', status: opts.unlocked ? 'unlocked' : 'locked', shieldedAddress: '0zk-test' },
  })
  store.set(activeShieldedWalletIdAtom, opts.unlocked ? 'rg-1' : null)
  store.set(tabVisibleAtom, opts.tabVisible ?? true)
  return store
}

beforeEach(() => {
  hoisted.watch.mockReset()
  hoisted.unsubscribe.mockReset()
  hoisted.getSdkWallet.mockReset()
  hoisted.watch.mockReturnValue(hoisted.unsubscribe)
  hoisted.getSdkWallet.mockResolvedValue({ watch: hoisted.watch })
})

describe('useShieldedWatch', () => {
  it('starts the watch loop (immediate:false, floor interval) when unlocked + visible', async () => {
    render(<Provider store={makeStore({ unlocked: true })}><Harness /></Provider>)
    await waitFor(() => expect(hoisted.watch).toHaveBeenCalledTimes(1))
    expect(hoisted.watch).toHaveBeenCalledWith(
      expect.objectContaining({ intervalMs: 30_000, immediate: false, onError: expect.any(Function) }),
    )
  })

  it('unsubscribes on unmount', async () => {
    const { unmount } = render(<Provider store={makeStore({ unlocked: true })}><Harness /></Provider>)
    await waitFor(() => expect(hoisted.watch).toHaveBeenCalledTimes(1))
    unmount()
    expect(hoisted.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('does not start when the wallet is locked', async () => {
    render(<Provider store={makeStore({ unlocked: false })}><Harness /></Provider>)
    await Promise.resolve()
    expect(hoisted.getSdkWallet).not.toHaveBeenCalled()
    expect(hoisted.watch).not.toHaveBeenCalled()
  })

  it('does not start when the tab is hidden (background-quota convention)', async () => {
    render(<Provider store={makeStore({ unlocked: true, tabVisible: false })}><Harness /></Provider>)
    await Promise.resolve()
    expect(hoisted.watch).not.toHaveBeenCalled()
  })
})
