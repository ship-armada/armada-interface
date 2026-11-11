// ABOUTME: Tests for the Settings overlay — the Notes card's "Merge" offers (hidden when nothing needs merging), Lock / Export /
// ABOUTME: Reset gated on wallet state, and the auto-lock and "Show transaction updates" preferences writing their atoms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SettingsModal } from './SettingsModal'
import { mergeIntentAtom, openModalAtom } from '@/state/ui'
import { activeShieldedWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'
import { preferencesAtom, DEFAULT_PREFERENCES } from '@/state/preferences'
import { txNoticeStyleAtom } from '@/state/txNotices'

// Note counts come from the SDK scan state; stub the hook so each test sets what the wallet holds.
const hoistedNotes = vi.hoisted(() => ({ counts: null as { usdc: number; shares: number } | null }))
vi.mock('@/hooks/useNoteCounts', () => ({ useNoteCounts: () => hoistedNotes.counts }))

function renderSettings(opts?: { walletUnlocked?: boolean; noWallet?: boolean }) {
  const store = createStore()
  store.set(openModalAtom, 'settings')
  if (!opts?.noWallet) {
    store.set(shieldedWalletsAtom, {
      'rg-1': {
        id: 'rg-1',
        status: opts?.walletUnlocked ? 'unlocked' : 'locked',
        shieldedAddress: '0zk-test',
      },
    })
    store.set(activeShieldedWalletIdAtom, 'rg-1')
  }
  render(
    <Provider store={store}>
      <SettingsModal />
    </Provider>,
  )
  return store
}

describe('<SettingsModal>', () => {
  beforeEach(() => {
    window.localStorage.clear()
    hoistedNotes.counts = null
  })

  it('offers "Merge" for each token spread across 5 or more notes, with the count', () => {
    hoistedNotes.counts = { usdc: 23, shares: 2 }
    const store = renderSettings({ walletUnlocked: true })
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByText('USDC — 23 notes')).toBeInTheDocument()
    // Two share notes don't need merging (every spend fits), so there's no row for them.
    expect(screen.queryByText(/Vault shares/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(store.get(openModalAtom)).toBe('merge')
    expect(store.get(mergeIntentAtom)).toEqual({ token: 'usdc' })
  })

  it('hides the Notes card when no token needs merging', () => {
    hoistedNotes.counts = { usdc: 4, shares: 0 }
    renderSettings({ walletUnlocked: true })
    expect(screen.queryByRole('heading', { name: 'Notes' })).toBeNull()
  })

  it("enables Lock and Export when the wallet is unlocked", () => {
    renderSettings({ walletUnlocked: true })
    expect(screen.getByRole('button', { name: 'Lock' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled()
  })

  it('disables Lock and Export when the wallet is locked', () => {
    renderSettings({ walletUnlocked: false })
    expect(screen.getByRole('button', { name: 'Lock' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('disables Reset when no wallet exists', () => {
    renderSettings({ noWallet: true })
    expect(screen.getByRole('button', { name: 'Reset…' })).toBeDisabled()
  })

  it('persists the auto-lock change to the preferences atom', () => {
    const store = renderSettings({ walletUnlocked: true })
    expect(store.get(preferencesAtom)).toEqual(DEFAULT_PREFERENCES)
    fireEvent.change(screen.getByLabelText('Auto-lock timer'), { target: { value: '5' } })
    expect(store.get(preferencesAtom).autoLockMinutes).toBe(5)
  })

  it('lets the user choose how transaction updates are shown (toasts by default)', () => {
    const store = renderSettings({ walletUnlocked: true })
    const select = screen.getByLabelText('Transaction updates')
    expect(select).toHaveValue('toast')
    fireEvent.change(select, { target: { value: 'pill' } })
    expect(store.get(txNoticeStyleAtom)).toBe('pill')
  })

})
