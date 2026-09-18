// ABOUTME: Tests for RelayerStatusBanner — reachability-gated availability notice + xchain delivery advisory.
// ABOUTME: Mocks useRelayerHealth to drive healthy / unreachable / indexer-stalled / not-configured states.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RelayerStatusBanner } from './RelayerStatusBanner'
import { useRelayerHealth } from '@/hooks/useRelayerHealth'

const mockUseRelayerHealth = useRelayerHealth as unknown as ReturnType<typeof vi.fn>
const refetchMock = vi.fn()

vi.mock('@/hooks/useRelayerHealth', () => ({
  useRelayerHealth: vi.fn(),
}))

/** Full hook shape; override per test. Defaults = configured + healthy. */
function health(overrides: Partial<ReturnType<typeof useRelayerHealth>> = {}) {
  return {
    isConfigured: true,
    isUnreachable: false,
    isChecking: false,
    isIndexerStalled: false,
    data: { status: 'healthy' },
    refetch: refetchMock,
    ...overrides,
  }
}

describe('<RelayerStatusBanner>', () => {
  beforeEach(() => {
    mockUseRelayerHealth.mockReset()
    refetchMock.mockClear()
  })

  it('renders nothing when the relayer is reachable and healthy', () => {
    mockUseRelayerHealth.mockReturnValue(health())
    const { container } = render(<RelayerStatusBanner isOpen />)
    expect(container.firstChild).toBeNull()
  })

  it('renders NOTHING for a `stale` self-report (routine indexer lag, relayer still reachable)', () => {
    // WHY: the core fix — a stale indexer must NOT surface the "can't find a relayer" banner. The
    // hook reports isUnreachable:false / isIndexerStalled:false for stale, so nothing renders — even
    // on a cross-chain flow (stale is below the delivery-advisory threshold).
    mockUseRelayerHealth.mockReturnValue(health({ data: { status: 'stale' } }))
    const { container } = render(<RelayerStatusBanner isOpen crossChain />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a neutral "Looking for a relayer…" state (no button) while a probe is in flight', () => {
    // isChecking wins over the unavailable branch so the banner never blanks mid-check (which would
    // read as "resolved") — covers both the initial open and a post-"Check again" refetch.
    mockUseRelayerHealth.mockReturnValue(health({ isChecking: true, isUnreachable: true, data: undefined }))
    const { container } = render(<RelayerStatusBanner isOpen />)
    expect(screen.getByRole('status').textContent).toMatch(/looking for an available relayer/i)
    // A spinner accompanies the message (aria-hidden svg from lucide's Loader2).
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('blocks a spend and offers "Check again" when the relayer is configured but unreachable', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    render(<RelayerStatusBanner isOpen />)
    expect(screen.getByRole('status').textContent).toMatch(/can't be submitted right now/i)
    expect(screen.getByRole('button', { name: /Check again/i })).toBeInTheDocument()
  })

  it('re-probes the relayer when the user clicks "Check again"', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    render(<RelayerStatusBanner isOpen />)
    fireEvent.click(screen.getByRole('button', { name: /Check again/i }))
    expect(refetchMock).toHaveBeenCalledTimes(1)
  })

  it('tells the shield flow it will fall back to a direct wallet submit (walletFallback)', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    render(<RelayerStatusBanner isOpen walletFallback />)
    expect(screen.getByRole('status').textContent).toMatch(/submitted from your own wallet/i)
    expect(screen.getByRole('status').textContent).toMatch(/network fees in ETH/i)
    // Still re-checkable while a relayer is configured.
    expect(screen.getByRole('button', { name: /Check again/i })).toBeInTheDocument()
  })

  it('shows a distinct "no relayer configured" spend banner with NO retry (P0-10)', () => {
    // Re-checking a build with no relayer configured can't help — omit the button.
    mockUseRelayerHealth.mockReturnValue(health({ isConfigured: false, data: undefined }))
    render(<RelayerStatusBanner isOpen />)
    expect(screen.getByRole('status').textContent).toMatch(/no relayer configured/i)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a "no relayer configured" shield banner (wallet fallback) with NO retry', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isConfigured: false, data: undefined }))
    render(<RelayerStatusBanner isOpen walletFallback />)
    expect(screen.getByRole('status').textContent).toMatch(/no relayer configured/i)
    expect(screen.getByRole('status').textContent).toMatch(/submitted from your own wallet/i)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('suppresses the availability banner when showAvailability is false (past Review)', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true, data: undefined }))
    const { container } = render(<RelayerStatusBanner isOpen walletFallback showAvailability={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('still shows the cross-chain delivery advisory when showAvailability is false', () => {
    // The delivery advisory is relevant DURING progress (delivery in flight), so it must survive
    // the post-Review availability suppression.
    mockUseRelayerHealth.mockReturnValue(health({ isIndexerStalled: true, data: { status: 'unhealthy' } }))
    render(<RelayerStatusBanner isOpen crossChain showAvailability={false} />)
    expect(screen.getByRole('status').textContent).toMatch(/cross-chain delivery may be delayed/i)
  })

  it('shows the cross-chain delivery advisory (no CTA) when the indexer is stalled on an xchain flow', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isIndexerStalled: true, data: { status: 'unhealthy' } }))
    render(<RelayerStatusBanner isOpen crossChain />)
    expect(screen.getByRole('status').textContent).toMatch(/cross-chain delivery may be delayed/i)
    // Advisory is informational — the delivery leg is relayer-driven regardless.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does NOT show the delivery advisory on a same-chain flow, even when the indexer is stalled', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isIndexerStalled: true, data: { status: 'unhealthy' } }))
    const { container } = render(<RelayerStatusBanner isOpen />)
    expect(container.firstChild).toBeNull()
  })
})
