// ABOUTME: Tests for HistoryRecoveryBanner — hidden when idle and during the sign-in scan, "Recovering…" during a scan the user started,
// ABOUTME: error copy + Retry CTA on failure that bumps historyRecoveryTriggerAtom.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { HistoryRecoveryBanner } from './HistoryRecoveryBanner'
import { historyRecoveryAtom, historyRecoveryTriggerAtom } from '@/state/history'

function renderWith(opts: { state: 'idle' | 'scanning' | 'failed'; error?: string; userInitiated?: boolean }) {
  const store = createStore()
  store.set(historyRecoveryAtom, {
    state: opts.state,
    ...(opts.error ? { error: opts.error } : {}),
    ...(opts.userInitiated !== undefined ? { userInitiated: opts.userInitiated } : {}),
  })
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

  it('stays hidden during the scan that runs on sign-in — the sync gate already covers that moment', () => {
    renderWith({ state: 'scanning', userInitiated: false })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the "Recovering…" copy during a scan the user started (Re-scan, Clear history, Retry)', () => {
    renderWith({ state: 'scanning', userInitiated: true })
    expect(screen.getByText(/Recovering activity from chain/i)).toBeInTheDocument()
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
