// ABOUTME: Tests for useRelayerSubmitBlock — the spend-flow Confirm gate when the relayer is
// ABOUTME: unavailable (not configured / unreachable), and that it clears while reachable.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { useRelayerSubmitBlock, RELAYER_UNAVAILABLE_REASON, RELAYER_CHECKING_REASON } from './useRelayerSubmitBlock'
import { useRelayerHealth } from '@/hooks/useRelayerHealth'

const mockUseRelayerHealth = useRelayerHealth as unknown as ReturnType<typeof vi.fn>

vi.mock('@/hooks/useRelayerHealth', () => ({ useRelayerHealth: vi.fn() }))

function health(overrides: Partial<ReturnType<typeof useRelayerHealth>> = {}) {
  return { isConfigured: true, isUnreachable: false, isChecking: false, isIndexerStalled: false, ...overrides }
}

function capture(): string | null {
  let reason: string | null = null
  function Harness() {
    reason = useRelayerSubmitBlock(true)
    return null
  }
  render(<Harness />)
  return reason
}

describe('useRelayerSubmitBlock', () => {
  beforeEach(() => mockUseRelayerHealth.mockReset())

  it('returns null when the relayer is reachable (Confirm enabled)', () => {
    mockUseRelayerHealth.mockReturnValue(health())
    expect(capture()).toBeNull()
  })

  it('blocks when the relayer is unreachable', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isUnreachable: true }))
    expect(capture()).toBe(RELAYER_UNAVAILABLE_REASON)
  })

  it('blocks when no relayer is configured', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isConfigured: false }))
    expect(capture()).toBe(RELAYER_UNAVAILABLE_REASON)
  })

  it('blocks while a probe is in flight (isChecking) — we do not yet know it is reachable', () => {
    mockUseRelayerHealth.mockReturnValue(health({ isChecking: true }))
    expect(capture()).toBe(RELAYER_CHECKING_REASON)
  })
})
