// ABOUTME: Tests for AppLayout's header pending pill — "N Pending" beside the wallet button while the active wallet has
// ABOUTME: txs in flight; one pending tx opens its receipt, several open the All activity panel.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { TxExecutionState, TxRecord } from '@/lib/tx/types'
import { txListAtom } from '@/state/tx'
import { activeShieldedWalletIdAtom } from '@/state/wallet'
import { activityPanelOpenAtom, receiptTxIdAtom } from '@/state/ui'
import { txRecord } from '@/test/fixtures/txValues'

vi.mock('./WalletConnector', () => ({ WalletConnector: () => <div>WALLET</div> }))
vi.mock('./sync', () => ({ SyncBanner: () => null }))
vi.mock('./history', () => ({ HistoryRecoveryBanner: () => null }))

import { AppLayout } from './AppLayout'

function rec(id: string, state: TxExecutionState): TxRecord {
  return txRecord('shield', { amount: 1n }, { id, executionState: state })
}

function renderLayout(records: TxRecord[]) {
  const store = createStore()
  store.set(activeShieldedWalletIdAtom, 'w')
  store.set(txListAtom, records)
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AppLayout>
          <div />
        </AppLayout>
      </MemoryRouter>
    </Provider>,
  )
  return store
}

describe('<AppLayout> pending pill', () => {
  it('is hidden when nothing is in flight', () => {
    renderLayout([rec('a', 'completed')])
    expect(screen.queryByRole('button', { name: /pending — view activity/ })).toBeNull()
  })

  it('opens the receipt of the one pending tx', () => {
    const store = renderLayout([rec('a', 'active'), rec('b', 'completed')])
    fireEvent.click(screen.getByRole('button', { name: '1 transaction pending — view activity' }))
    expect(store.get(receiptTxIdAtom)).toBe('a')
  })

  it('opens the All activity panel when several are pending', () => {
    const store = renderLayout([rec('a', 'active'), rec('b', 'waiting')])
    fireEvent.click(screen.getByRole('button', { name: '2 transactions pending — view activity' }))
    expect(store.get(activityPanelOpenAtom)).toBe(true)
    expect(store.get(receiptTxIdAtom)).toBeNull()
  })
})
