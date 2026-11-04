// ABOUTME: Tests for usePendingTabTitle — the browser tab title counts in-flight txs ("(2) Armada App — Dashboard")
// ABOUTME: so a backgrounded tab shows that work is still going, and goes back to the plain title once they settle.

import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import type { TxExecutionState, TxRecord } from '@/lib/tx/types'
import { txListAtom } from '@/state/tx'
import { activeShieldedWalletIdAtom } from '@/state/wallet'
import { txRecord } from '@/test/fixtures/txValues'
import { usePendingTabTitle } from './usePendingTabTitle'

const BASE = 'Armada App — Dashboard'

function rec(id: string, state: TxExecutionState): TxRecord {
  return txRecord('shield', { amount: 1n }, { id, executionState: state })
}

afterEach(() => {
  document.title = BASE
})

describe('usePendingTabTitle', () => {
  it('prefixes the title with the pending count and restores it when nothing is pending', () => {
    document.title = BASE
    const store = createStore()
    store.set(activeShieldedWalletIdAtom, 'w')
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { unmount } = renderHook(() => usePendingTabTitle(), { wrapper })
    expect(document.title).toBe(BASE)

    act(() => store.set(txListAtom, [rec('a', 'active'), rec('b', 'waiting'), rec('c', 'completed')]))
    expect(document.title).toBe(`(2) ${BASE}`)

    act(() => store.set(txListAtom, [rec('a', 'completed'), rec('b', 'waiting')]))
    expect(document.title).toBe(`(1) ${BASE}`)

    act(() => store.set(txListAtom, [rec('a', 'completed'), rec('b', 'failed')]))
    expect(document.title).toBe(BASE)

    act(() => store.set(txListAtom, [rec('d', 'active')]))
    unmount()
    expect(document.title).toBe(BASE)
  })
})
