// ABOUTME: Tests for TxNoticePreview — the Debug page's tx-notice preview: switch between the toast and header-pill styles
// ABOUTME: (the Settings preference), and fire sample outcome notices (no real tx).

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { txNoticeFeedAtom, txNoticeStyleAtom } from '@/state/txNotices'
import { TxNoticePreview } from './TxNoticePreview'

function setup() {
  const store = createStore()
  render(
    <Provider store={store}>
      <TxNoticePreview />
    </Provider>,
  )
  return store
}

describe('<TxNoticePreview>', () => {
  it('switches the notice style', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Header pill' }))
    expect(store.get(txNoticeStyleAtom)).toBe('pill')
    fireEvent.click(screen.getByRole('radio', { name: 'Toasts' }))
    expect(store.get(txNoticeStyleAtom)).toBe('toast')
  })

  it('fires sample notices, numbered on from the feed', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Sent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Received' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unknown' }))
    expect(store.get(txNoticeFeedAtom).map((n) => [n.seq, n.tone])).toEqual([
      [1, 'success'],
      [2, 'failure'],
      [3, 'received'],
      [4, 'uncertain'],
    ])
    // A tx in flight is the header pill's job, not a notice — there's no pending sample.
    expect(screen.queryByRole('button', { name: 'Pending' })).toBeNull()
  })
})
