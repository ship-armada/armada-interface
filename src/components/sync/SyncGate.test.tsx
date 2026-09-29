// ABOUTME: Tests for SyncGate — the gate decision (isInitialSyncGated), progress vs failed rendering,
// ABOUTME: and that "Try again" optimistically flips sync to syncing + bumps the retry epoch.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SyncGate, isInitialSyncGated } from './SyncGate'
import { syncStateAtom, syncRetryEpochAtom } from '@/state/wallet'

function wrap(store: ReturnType<typeof createStore>, ui: React.ReactElement) {
  return <Provider store={store}>{ui}</Provider>
}

describe('isInitialSyncGated', () => {
  it('gates while there is no balance yet — whatever the scan status, until its balance is read (G-11, #80)', () => {
    // WHY: between the scan's `complete` and the SDK balance read landing, the dashboard has no real balance.
    // Ungated, it showed one derived from local history (ignoring fees, received payments and merges) — the UI
    // only ever shows the SDK balance, so it stays on the loading gate instead. The gate reads only the balance,
    // so no sync status can lift it early.
    expect(isInitialSyncGated(null)).toBe(true)
  })

  it('does NOT gate once a balance is known, even mid background re-sync', () => {
    // WHY: a balance of 0n is still a KNOWN balance (completed scan, empty wallet). Blanking the
    // dashboard on every background refresh after that would be a regression.
    expect(isInitialSyncGated(0n)).toBe(false)
    expect(isInitialSyncGated(5_000_000n)).toBe(false)
  })
})

describe('<SyncGate>', () => {
  it('shows the progress meter while syncing', () => {
    const store = createStore()
    store.set(syncStateAtom, { status: 'syncing', progress: 0.42 })
    render(wrap(store, <SyncGate />))
    // The percent lives in the ring's progressbar (number + "%" are separate nodes).
    const meter = screen.getByRole('progressbar')
    expect(meter).toHaveTextContent('42%')
    expect(meter.getAttribute('aria-valuenow')).toBe('42')
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('shows a Try again button when the sync failed', () => {
    const store = createStore()
    store.set(syncStateAtom, { status: 'failed', progress: 0.1 })
    render(wrap(store, <SyncGate />))
    expect(screen.getByText('Sync interrupted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('Try again optimistically flips to syncing and bumps the retry epoch', () => {
    const store = createStore()
    store.set(syncStateAtom, { status: 'failed', progress: 0.1 })
    expect(store.get(syncRetryEpochAtom)).toBe(0)

    render(wrap(store, <SyncGate />))
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    // Optimistic flip means the UI leaves the failed state immediately (re-renders to progress).
    expect(store.get(syncStateAtom)).toEqual({ status: 'syncing', progress: 0 })
    // Epoch bump is what re-runs useShieldedBalanceSync's scan.
    expect(store.get(syncRetryEpochAtom)).toBe(1)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
