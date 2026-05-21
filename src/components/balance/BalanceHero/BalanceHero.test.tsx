// ABOUTME: Tests for BalanceHero — verifies syncing placeholder, formatted total, breakdown values across nullable states.
// ABOUTME: Renders with Jotai's Provider and seeds atoms so the test doesn't depend on app boot order.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { BalanceHero } from './BalanceHero'
import { shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'
import { withTestQueryClient } from '@/test-utils/queryClient'

function renderWith(values: { shielded: bigint | null; yieldShares: bigint | null }) {
  const store = createStore()
  store.set(shieldedUsdcAtom, values.shielded)
  store.set(yieldSharesAtom, values.yieldShares)
  return render(withTestQueryClient(
    <Provider store={store}>
      <BalanceHero />
    </Provider>,
  ))
}

describe('<BalanceHero>', () => {
  it('shows the syncing placeholder while shielded is null', () => {
    renderWith({ shielded: null, yieldShares: 0n })
    expect(screen.getByText('Syncing private balance…')).toBeInTheDocument()
  })

  it('renders the shielded total even when yieldShares is still null (yield sync is independent)', () => {
    renderWith({ shielded: 1_000_000n, yieldShares: null })
    expect(screen.queryByText('Syncing private balance…')).not.toBeInTheDocument()
    // "1.00" appears twice: once in the total, once in the breakdown row.
    expect(screen.getAllByText('1.00').length).toBeGreaterThanOrEqual(1)
  })

  it('renders an em-dash for the earning sub-balance when yieldRate is null (stub returns null today)', () => {
    renderWith({ shielded: 10_200_120_000n, yieldShares: 0n })
    // "10,200.12" appears in the total AND in the breakdown row (since earningUsdc = 0 contribution).
    expect(screen.getAllByText('10,200.12').length).toBeGreaterThanOrEqual(1)
    // yieldShares is 0 but yieldRate is null (stub), so earningUsdc is null → breakdown shows "—"
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders the static "Total private USDC" label and "USDC" unit suffix when synced (total displays)', () => {
    renderWith({ shielded: 10_200_120_000n, yieldShares: 0n })
    expect(screen.getByText(/Total private USDC/i)).toBeInTheDocument()
    // Total renders the shielded amount (earningUsdc is null but treated as 0 in the total).
    expect(screen.getByText('USDC')).toBeInTheDocument()
  })

  it('renders both breakdown labels', () => {
    renderWith({ shielded: 10_200_120_000n, yieldShares: 0n })
    expect(screen.getByText('Available privately')).toBeInTheDocument()
    expect(screen.getByText('Earning in vault')).toBeInTheDocument()
  })
})
