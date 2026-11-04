// ABOUTME: Tests for useTxNotices — the App-level watcher that turns tx record changes into the notice feed: quiet until
// ABOUTME: the wallet's stored history is loaded (that's the baseline), then one notice per change worth announcing.

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import type { TxExecutionState, TxRecord } from '@/lib/tx/types'
import { txHistoryHydratedAtom, txListAtom } from '@/state/tx'
import { txInViewIdsAtom, txNoticeFeedAtom } from '@/state/txNotices'
import { activeShieldedWalletIdAtom } from '@/state/wallet'
import { txRecord } from '@/test/fixtures/txValues'
import { useTxNotices } from './useTxNotices'

function send(state: TxExecutionState, id = 'send-1'): TxRecord {
  return txRecord('transfer-shielded', { amount: 5_000_000n }, { id, executionState: state })
}

function setup() {
  const store = createStore()
  store.set(activeShieldedWalletIdAtom, 'w')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useTxNotices(), { wrapper })
  return store
}

describe('useTxNotices', () => {
  it('treats everything loaded with the stored history as the baseline — no notices for it', () => {
    const store = setup()
    act(() => {
      store.set(txListAtom, [send('completed', 'old')])
      store.set(txHistoryHydratedAtom, 'w')
    })
    expect(store.get(txNoticeFeedAtom)).toEqual([])
  })

  it('announces a tx that settles while the user is elsewhere', () => {
    const store = setup()
    act(() => {
      store.set(txListAtom, [send('waiting')])
      store.set(txHistoryHydratedAtom, 'w')
    })
    act(() => store.set(txListAtom, [send('completed')]))
    const feed = store.get(txNoticeFeedAtom)
    expect(feed.map((n) => [n.tone, n.record.id])).toEqual([['success', 'send-1']])
    expect(feed[0]?.seq).toBe(1)
  })

  it('stays quiet for a tx on screen, and says "pending" once the user leaves it mid-flight', () => {
    const store = setup()
    act(() => {
      store.set(txHistoryHydratedAtom, 'w')
      store.set(txInViewIdsAtom, new Set(['send-1']))
      store.set(txListAtom, [send('active')])
    })
    act(() => store.set(txListAtom, [send('waiting')]))
    expect(store.get(txNoticeFeedAtom)).toEqual([])
    act(() => store.set(txInViewIdsAtom, new Set()))
    expect(store.get(txNoticeFeedAtom).map((n) => n.tone)).toEqual(['pending'])
  })

  it('clears the feed and goes quiet when the wallet locks', () => {
    const store = setup()
    act(() => {
      store.set(txListAtom, [send('waiting')])
      store.set(txHistoryHydratedAtom, 'w')
    })
    act(() => store.set(txListAtom, [send('completed')]))
    act(() => {
      store.set(activeShieldedWalletIdAtom, null)
      store.set(txHistoryHydratedAtom, null)
    })
    expect(store.get(txNoticeFeedAtom)).toEqual([])
  })
})
