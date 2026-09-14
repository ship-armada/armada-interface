// ABOUTME: Tests for RelayerStatusBanner — reachability-gated broadcast nudge + xchain delivery advisory.
// ABOUTME: Mocks useRelayerHealth to drive healthy / unreachable / indexer-stalled / not-configured states.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { RelayerStatusBanner } from './RelayerStatusBanner'
import { preferencesAtom, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY } from '@/state/preferences'
import { useRelayerHealth } from '@/hooks/useRelayerHealth'

const mockUseRelayerHealth = useRelayerHealth as unknown as ReturnType<typeof vi.fn>

vi.mock('@/hooks/useRelayerHealth', () => ({
  useRelayerHealth: vi.fn(),
}))

/** Full hook shape; override per test. Defaults = configured + healthy. */
function health(overrides: Partial<ReturnType<typeof useRelayerHealth>> = {}) {
  return { isConfigured: true, isUnreachable: false, isIndexerStalled: false, data: { status: 'healthy' }, ...overrides }
}

function wrapWith(store: ReturnType<typeof createStore>, ui: React.ReactElement) {
  return <Provider store={store}>{ui}</Provider>
}

describe('<RelayerStatusBanner>', () => {
  beforeEach(() => {
    mockUseRelayerHealth.mockReset()
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY)
  })

  it('renders nothing when the relayer is reachable and healthy', () => {
    mockUseRelayerHealth.mockReturnValue(health())
    const store = createStore()
    const { container } = render(wrapWith(store, <RelayerStatusBanner isOpen />))
    expect(container.firstChild).toBeNull()
  })

  it('renders NOTHING for a `stale` self-report (routine indexer lag, relayer still reachable)', () => {
    // WHY: the core fix — a stale indexer must NOT surface the "can't find a relayer" banner. The
    // hook reports isUnreachable:false / isIndexerStalled:false for stale, so nothing renders — even
    // on a cross-chain flow (stale is below the delivery-advisory threshold).
    mockUseRelayerHealth.mockReturnValue(health({ data: { status: 'stale' } }))
    const store = createStore()
    const { container } = render(wrapWith(store, <RelayerStatusBanner isOpen crossChain />))
    expect(container.firstChild).toBeNull()
  })

  it('renders the unreachable banner with the wallet-submit CTA', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    const store = createStore()
    const { getByRole } = render(wrapWith(store, <RelayerStatusBanner isOpen />))
    expect(getByRole('status').textContent).toMatch(/can't find an available relayer/i)
    expect(getByRole('button', { name: /Submit from my wallet instead/i })).toBeInTheDocument()
  })

  it('suppresses the unreachable nudge once submitFromWallet is enabled', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    const store = createStore()
    store.set(preferencesAtom, { ...DEFAULT_PREFERENCES, submitFromWallet: true })
    const { container } = render(wrapWith(store, <RelayerStatusBanner isOpen />))
    expect(container.firstChild).toBeNull()
  })

  it('renders a distinct "no relayer configured" banner with a wallet-submit CTA (P0-10)', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isConfigured: false, data: undefined }))
    const store = createStore()
    const { getByRole } = render(wrapWith(store, <RelayerStatusBanner isOpen />))
    expect(getByRole('status').textContent).toMatch(/no relayer is configured/i)
    expect(getByRole('button', { name: /Submit from my wallet/i })).toBeInTheDocument()
  })

  it('flips submitFromWallet to true when the user clicks the unreachable-banner action', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    const store = createStore()
    render(wrapWith(store, <RelayerStatusBanner isOpen />))
    fireEvent.click(screen.getByRole('button', { name: /Submit from my wallet instead/i }))
    expect(store.get(preferencesAtom).submitFromWallet).toBe(true)
  })

  it('shows the cross-chain delivery advisory (no CTA) when the indexer is stalled on an xchain flow', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isIndexerStalled: true, data: { status: 'unhealthy' } }))
    const store = createStore()
    const { getByRole, queryByRole } = render(wrapWith(store, <RelayerStatusBanner isOpen crossChain />))
    expect(getByRole('status').textContent).toMatch(/cross-chain delivery may be delayed/i)
    // Advisory is informational — wallet-submit doesn't change the relayer-driven delivery leg.
    expect(queryByRole('button')).toBeNull()
  })

  it('does NOT show the delivery advisory on a same-chain flow, even when the indexer is stalled', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isIndexerStalled: true, data: { status: 'unhealthy' } }))
    const store = createStore()
    const { container } = render(wrapWith(store, <RelayerStatusBanner isOpen />))
    expect(container.firstChild).toBeNull()
  })

  it('still shows the delivery advisory under submitFromWallet (delivery is relayer-driven regardless)', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isIndexerStalled: true, data: { status: 'unhealthy' } }))
    const store = createStore()
    store.set(preferencesAtom, { ...DEFAULT_PREFERENCES, submitFromWallet: true })
    const { getByRole } = render(wrapWith(store, <RelayerStatusBanner isOpen crossChain />))
    expect(getByRole('status').textContent).toMatch(/cross-chain delivery may be delayed/i)
  })
})
