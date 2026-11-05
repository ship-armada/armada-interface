// ABOUTME: Tests for usePendingTxLabel — the header pill's label for the one tx in flight ("Shielding 5.00 USDC…"), from
// ABOUTME: the notice copy (amount dropped while balances are hidden); null when none or several are pending.

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import type { TxExecutionState, TxRecord } from '@/lib/tx/types'
import { txListAtom } from '@/state/tx'
import { balanceHiddenAtom } from '@/state/ui'
import { activeShieldedWalletIdAtom } from '@/state/wallet'
import { txRecord } from '@/test/fixtures/txValues'
import { usePendingTxLabel } from './usePendingTxLabel'

function shield(id: string, state: TxExecutionState): TxRecord {
  return txRecord('shield', { amount: 5_000_000n }, { id, executionState: state })
}

function label(records: TxRecord[], hidden = false) {
  const store = createStore()
  store.set(activeShieldedWalletIdAtom, 'w')
  store.set(txListAtom, records)
  store.set(balanceHiddenAtom, hidden)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return renderHook(() => usePendingTxLabel(), { wrapper }).result.current
}

describe('usePendingTxLabel', () => {
  it('names the one pending tx', () => {
    expect(label([shield('a', 'active'), shield('b', 'completed')])).toBe('Shielding 5.00 USDC…')
  })

  it('leaves the amount out while balances are hidden', () => {
    expect(label([shield('a', 'waiting')], true)).toBe('Shielding USDC…')
  })

  it('is null when nothing, or more than one tx, is pending', () => {
    expect(label([shield('a', 'completed')])).toBeNull()
    expect(label([shield('a', 'active'), shield('b', 'waiting')])).toBeNull()
  })
})
