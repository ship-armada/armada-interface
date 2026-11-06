// ABOUTME: Tests for HistoryRecoveryBanner — hidden when idle or scanning (Settings and the refilling list show a scan), error copy +
// ABOUTME: Retry CTA on failure that bumps historyRecoveryTriggerAtom.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { HistoryRecoveryBanner } from './HistoryRecoveryBanner'
import { historyRecoveryAtom, historyRecoveryTriggerAtom } from '@/state/history'

function renderWith(opts: { state: 'idle' | 'scanning' | 'failed'; error?: string }) {
  const store = createStore()
  store.set(historyRecoveryAtom, opts.error
    ? { state: opts.state, error: opts.error }
    : { state: opts.state })
  render(
    <Provider store={store}>
      <HistoryRecoveryBanner />
    </Provider>,
  )
  return store
}

describe('<HistoryRecoveryBanner>', () => {
  it('renders nothing when state is idle', () => {
    renderWith({ state: 'idle' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays hidden while a scan runs — on sign-in the sync gate covers it, otherwise Settings\' "Scanning…" and the list', () => {
    renderWith({ state: 'scanning' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows error copy + Retry CTA on failure; clicking Retry bumps the epoch atom', () => {
    // WHY: Retry is the user's escape hatch when the SDK / RPC blip and the scan errored.
    // The banner must surface a CTA, not just sit on the error — that would strand them.
    const store = renderWith({ state: 'failed', error: 'rpc unreachable' })
    expect(screen.getByText(/Couldn't recover activity from chain/i)).toBeInTheDocument()
    expect(screen.getByText(/rpc unreachable/i)).toBeInTheDocument()
    expect(store.get(historyRecoveryTriggerAtom).id).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    expect(store.get(historyRecoveryTriggerAtom).id).toBe(1)
    // Retry is user-initiated → visible (not silent), so the banner shows during the rescan.
    expect(store.get(historyRecoveryTriggerAtom).silent).toBe(false)
  })
})
