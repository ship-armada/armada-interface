// ABOUTME: Tests for useOpenTxActivity — how the header pill (and tx notices) open a tx's receipt or the activity panel
// ABOUTME: from any page: they set the Dashboard's atoms and route to the Dashboard, which renders both.

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { activityPanelOpenAtom, receiptTxIdAtom } from '@/state/ui'
import { useOpenTxActivity } from './useOpenTxActivity'

function setup() {
  const store = createStore()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/debug']}>{children}</MemoryRouter>
    </Provider>
  )
  const { result } = renderHook(() => ({ open: useOpenTxActivity(), location: useLocation() }), { wrapper })
  return { store, result }
}

describe('useOpenTxActivity', () => {
  it('openReceipt opens that tx\'s receipt on the Dashboard', () => {
    const { store, result } = setup()
    act(() => result.current.open.openReceipt('tx-1'))
    expect(store.get(receiptTxIdAtom)).toBe('tx-1')
    expect(result.current.location.pathname).toBe('/')
  })

  it('openActivity opens the All activity panel on the Dashboard', () => {
    const { store, result } = setup()
    act(() => result.current.open.openActivity())
    expect(store.get(activityPanelOpenAtom)).toBe(true)
    expect(result.current.location.pathname).toBe('/')
  })
})
