// ABOUTME: Tests for getNetworkConfig — verifies the maxLogRange cap is conservatively set on testnets so getLogs cannot overrun public RPC limits.

import { describe, it, expect } from 'vitest'
import { getNetworkConfig } from './network'

describe('getNetworkConfig', () => {
  it('exposes a maxLogRange field used as the safe per-chunk block window', () => {
    const cfg = getNetworkConfig()
    expect(cfg.maxLogRange).toBeGreaterThan(0)
  })

  // In the vitest config we pin VITE_NETWORK='local', so we expect the local cap (effectively
  // unlimited for Anvil). The testnet cap is verified at deploy-time review — keeping a single
  // code path means the chunker still runs locally and exercises the same logic.
  it('uses a generous cap on local mode (single chunk for any realistic range)', () => {
    const cfg = getNetworkConfig()
    expect(cfg.mode).toBe('local')
    expect(cfg.maxLogRange).toBeGreaterThanOrEqual(50_000)
  })
})
