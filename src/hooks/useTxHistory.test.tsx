// ABOUTME: Tests for useTxHistory — wallet-scoped hydration. On mount/activeId change, the atom resets and re-hydrates from IDB filtered to the active walletId.
// ABOUTME: Also: no IDB read while locked, a locked → unlocked flip hydrates, the hydrated mark is set, and the list clears on lock.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { activeTxListAtom, txHistoryHydratedAtom, txListAtom } from '@/state/tx'
import { activeShieldedWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'
import type { TxRecord } from '@/lib/tx/types'

const hoisted = vi.hoisted(() => ({
  mockLoadAllTx: vi.fn<(walletId?: string) => Promise<TxRecord[]>>(async () => []),
}))

vi.mock('@/lib/tx/storage', () => ({
  loadAllTx: hoisted.mockLoadAllTx,
}))

import { useTxHistory } from './useTxHistory'

function fixture(id: string, walletId: string): TxRecord<'shield'> {
  return {
    id,
    kind: 'shield',
    executionState: 'completed',
    stage: 'hub-confirmed',
    stagesCompleted: ['build-proof'],
    updatedSeq: 1,
    createdAt: 0,
    updatedAt: 0,
    meta: { amount: 1n, feeCacheId: '', fromChainId: 31337 },
    artifacts: {},
    walletContext: {
      evmAddress: '0xabc',
      shieldedWalletId: walletId,
      sourceChainId: 31337,
    },
  } as TxRecord<'shield'>
}

function Harness() {
  useTxHistory()
  return null
}

function mount(activeWalletId: string | null, status: 'locked' | 'unlocked' = 'unlocked') {
  const store = createStore()
  if (activeWalletId) {
    store.set(shieldedWalletsAtom, {
      [activeWalletId]: { id: activeWalletId, status, shieldedAddress: '0zk-test' },
    })
  }
  store.set(activeShieldedWalletIdAtom, activeWalletId)
  const result = render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  )
  return { store, ...result }
}

/** Flip the active wallet to a new id with an unlocked entry seeded. Mirrors the runtime
 *  behaviour of useShieldedWallet.signIn: writes both the wallet entry and the active-id atom. */
function setActiveWallet(
  store: ReturnType<typeof createStore>,
  walletId: string,
  status: 'locked' | 'unlocked' = 'unlocked',
) {
  store.set(shieldedWalletsAtom, {
    [walletId]: { id: walletId, status, shieldedAddress: '0zk-test' },
  })
  store.set(activeShieldedWalletIdAtom, walletId)
}

beforeEach(() => {
  hoisted.mockLoadAllTx.mockReset()
  hoisted.mockLoadAllTx.mockResolvedValue([])
})

describe('useTxHistory', () => {
  it('hydrates from IDB filtered to the active walletId on mount', async () => {
    hoisted.mockLoadAllTx.mockResolvedValueOnce([fixture('a', 'rg-1'), fixture('b', 'rg-1')])
    const { store } = mount('rg-1')
    await waitFor(() => {
      expect(hoisted.mockLoadAllTx).toHaveBeenCalledWith('rg-1')
    })
    await waitFor(() => {
      expect(store.get(txListAtom).map(r => r.id).sort()).toEqual(['a', 'b'])
    })
  })

  it('marks the wallet hydrated once its stored records are in the list (the notice watcher\'s baseline)', async () => {
    hoisted.mockLoadAllTx.mockResolvedValueOnce([fixture('a', 'rg-1')])
    const { store } = mount('rg-1')
    expect(store.get(txHistoryHydratedAtom)).toBeNull()
    await waitFor(() => expect(store.get(txHistoryHydratedAtom)).toBe('rg-1'))
    expect(store.get(txListAtom).map(r => r.id)).toEqual(['a'])
  })

  it('does NOT hit IDB when no wallet is active (locked)', () => {
    mount(null)
    expect(hoisted.mockLoadAllTx).not.toHaveBeenCalled()
  })

  it('does NOT hit IDB when the wallet is present but locked (keyManager has no decryption key)', () => {
    // WHY: this is the bug fix from the cold-load / refresh-after-sign-in scenario. With a
    // cached walletId restored at boot but the wallet still locked (no rootSecret yet), we
    // MUST NOT call loadAllTx — it'd return [] (locked-guard) and emit a misleading
    // `tx.history.hydrated: 0` event. The effect must re-fire when status flips to unlocked.
    mount('rg-1', 'locked')
    expect(hoisted.mockLoadAllTx).not.toHaveBeenCalled()
  })

  it('hydrates when the wallet flips from locked → unlocked (no walletId change)', async () => {
    // WHY: the original cold-load failure. activeShieldedWalletIdAtom is set at boot from the
    // cached walletId, but the wallet is locked until sign-in completes. The effect now
    // depends on lock STATUS, not just id — sign-in flips the status, the effect re-runs.
    hoisted.mockLoadAllTx.mockResolvedValueOnce([fixture('a', 'rg-1')])
    const { store } = mount('rg-1', 'locked')
    expect(hoisted.mockLoadAllTx).not.toHaveBeenCalled()
    // Simulate sign-in: flip the entry to unlocked (same walletId).
    setActiveWallet(store, 'rg-1', 'unlocked')
    await waitFor(() => {
      expect(hoisted.mockLoadAllTx).toHaveBeenCalledWith('rg-1')
    })
    await waitFor(() => {
      expect(store.get(txListAtom).map(r => r.id)).toEqual(['a'])
    })
  })

  it('resets txListAtom and re-hydrates when the active walletId changes', async () => {
    hoisted.mockLoadAllTx.mockImplementation(async (id?: string) => {
      if (id === 'rg-1') return [fixture('a', 'rg-1')]
      if (id === 'rg-2') return [fixture('c', 'rg-2')]
      return []
    })
    const { store } = mount('rg-1')
    await waitFor(() => {
      expect(store.get(txListAtom).map(r => r.id)).toEqual(['a'])
    })

    // Account switch: seed rg-2 + flip activeId to rg-2.
    setActiveWallet(store, 'rg-2', 'unlocked')
    await waitFor(() => {
      expect(store.get(txListAtom).map(r => r.id)).toEqual(['c'])
    })
    // Critical assertion: no spillover from rg-1.
    expect(store.get(txListAtom).every(r => r.walletContext.shieldedWalletId === 'rg-2')).toBe(true)
  })

  it('clears the decrypted history when the wallet locks — the status flips, the walletId stays (a real lock)', async () => {
    // WHY: lock() and the account-switch lock flip the entry to 'locked' and KEEP the active id, so activeTxListAtom (which
    // filters on the id only) would keep returning the decrypted records. Only this hook's reset on the status flip
    // clears them — the walletId-null case below doesn't exercise that.
    hoisted.mockLoadAllTx.mockResolvedValueOnce([fixture('a', 'rg-1')])
    const { store } = mount('rg-1')
    await waitFor(() => expect(store.get(txListAtom)).toHaveLength(1))
    setActiveWallet(store, 'rg-1', 'locked')
    await waitFor(() => expect(store.get(txListAtom)).toEqual([]))
    expect(store.get(activeTxListAtom)).toEqual([])
    expect(store.get(txHistoryHydratedAtom)).toBeNull()
  })

  it('clears txListAtom when the active walletId goes null (lock)', async () => {
    hoisted.mockLoadAllTx.mockResolvedValueOnce([fixture('a', 'rg-1')])
    const { store } = mount('rg-1')
    await waitFor(() => {
      expect(store.get(txListAtom)).toHaveLength(1)
    })
    store.set(activeShieldedWalletIdAtom, null)
    store.set(shieldedWalletsAtom, {})
    await waitFor(() => {
      expect(store.get(txListAtom)).toEqual([])
    })
  })
})
