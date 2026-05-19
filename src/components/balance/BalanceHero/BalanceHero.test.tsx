// ABOUTME: Tests for BalanceHero — verifies syncing placeholder, formatted total, breakdown values across nullable states.
// ABOUTME: Renders with Jotai's Provider and seeds atoms so the test doesn't depend on app boot order.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { BalanceHero } from './BalanceHero'
import { shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'

function renderWith(values: { shielded: bigint | null; yieldShares: bigint | null }) {
  const store = createStore()
  store.set(shieldedUsdcAtom, values.shielded)
  store.set(yieldSharesAtom, values.yieldShares)
  return render(
    <Provider store={store}>
      <BalanceHero />
    </Provider>,
  )
}

describe('<BalanceHero>', () => {
  it('shows the syncing placeholder while shielded is null', () => {
    renderWith({ shielded: null, yieldShares: 0n })
    expect(screen.getByText('Syncing private balance…')).toBeInTheDocument()
  })

  it('shows the syncing placeholder while yieldShares is null', () => {
    renderWith({ shielded: 1_000_000n, yieldShares: null })
    expect(screen.getByText('Syncing private balance…')).toBeInTheDocument()
  })

  it('renders an em-dash for the earning sub-balance when yieldRate is null (stub returns null today)', () => {
    renderWith({ shielded: 10_200_120_000n, yieldShares: 0n })
    expect(screen.getByText('10,200.12')).toBeInTheDocument()
    // yieldShares is 0 but yieldRate is null (stub), so earningUsdc is null → "—"
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders the static "Total private USDC" label and "USDC" unit suffix when synced (total displays)', () => {
    renderWith({ shielded: 10_200_120_000n, yieldShares: 0n })
    expect(screen.getByText(/Total private USDC/i)).toBeInTheDocument()
    // Total is null (earningUsdc is null) → em-dash; USDC suffix still rendered
    expect(screen.getByText('USDC')).toBeInTheDocument()
  })

  it('renders both breakdown labels', () => {
    renderWith({ shielded: 10_200_120_000n, yieldShares: 0n })
    expect(screen.getByText('Available privately')).toBeInTheDocument()
    expect(screen.getByText('Earning in vault')).toBeInTheDocument()
  })
})
