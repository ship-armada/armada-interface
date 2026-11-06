// ABOUTME: Tests for SyncBanner's failed state — it says the funds are safe on chain, and adds a link to get help once a
// ABOUTME: retry has failed too; Try again stays.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SyncBanner } from './SyncBanner'
import { syncStateAtom, syncRetryEpochAtom } from '@/state/wallet'

function renderFailed(retries: number) {
  const store = createStore()
  store.set(syncStateAtom, { status: 'failed', progress: 0 })
  store.set(syncRetryEpochAtom, retries)
  render(<Provider store={store}><SyncBanner /></Provider>)
}

describe('<SyncBanner> failed (11E)', () => {
  it('says the funds are safe on chain, with Try again', () => {
    renderFailed(0)
    expect(screen.getByText(/your funds are safe on chain/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Get help/ })).toBeNull()
  })

  it('adds a link to get help once a retry has failed too', () => {
    renderFailed(2)
    expect(screen.getByRole('link', { name: /Get help on Discord/ })).toBeInTheDocument()
  })
})
