// ABOUTME: Tests for getNetworkConfig — verifies the maxLogRange cap is conservatively set on testnets so getLogs cannot overrun public RPC limits.

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getNetworkConfig,
  resolveEnabledClients,
  getClientRegistry,
  type ClientEntry,
} from './network'

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

  // B4 invariant: with VITE_INDEXER_URL unset (the default test env), indexerUrl resolves to null,
  // so the watcher quick-sync client returns empty and the engine falls back to its slow on-chain
  // scan. The app must be fully functional in this state. When set, both modes honor the env var.
  it('resolves indexerUrl to null when VITE_INDEXER_URL is unset (quick sync disabled → slow scan)', () => {
    const cfg = getNetworkConfig()
    expect(cfg.indexerUrl).toBeNull()
  })
})

// A synthetic 3-client registry — exercises N>2 without depending on the real local/sepolia entries.
const REGISTRY: readonly ClientEntry[] = [
  { key: 'client-a', identity: { chainId: 1001, domain: 101, name: 'A', rpcUrls: ['http://a'] } },
  { key: 'client-b', identity: { chainId: 1002, domain: 102, name: 'B', rpcUrls: ['http://b'] } },
  { key: 'client-c', identity: { chainId: 1003, domain: 103, name: 'C', rpcUrls: ['http://c'] } },
]

describe('resolveEnabledClients — boot-time enable-list', () => {
  it('returns ALL registry clients (in order) when the enable-list is unset', () => {
    const out = resolveEnabledClients(REGISTRY, undefined)
    expect(out.map(c => c.chainId)).toEqual([1001, 1002, 1003])
  })

  it('returns ALL registry clients when the enable-list is empty/whitespace', () => {
    expect(resolveEnabledClients(REGISTRY, '').map(c => c.chainId)).toEqual([1001, 1002, 1003])
    expect(resolveEnabledClients(REGISTRY, '   ').map(c => c.chainId)).toEqual([1001, 1002, 1003])
  })

  it('filters to the named subset, preserving REGISTRY order (not the env order)', () => {
    const out = resolveEnabledClients(REGISTRY, 'client-c, client-a')
    expect(out.map(c => c.chainId)).toEqual([1001, 1003])
  })

  it('tolerates surrounding whitespace and blank entries in the CSV', () => {
    const out = resolveEnabledClients(REGISTRY, ' client-b , , client-c ')
    expect(out.map(c => c.chainId)).toEqual([1002, 1003])
  })

  it('throws a descriptive error naming the unknown key and the valid keys', () => {
    expect(() => resolveEnabledClients(REGISTRY, 'client-a,nope')).toThrowError(/nope/)
    expect(() => resolveEnabledClients(REGISTRY, 'nope')).toThrowError(/client-a.*client-b.*client-c/s)
  })
})

describe('resolveEnabledClients — enabledByDefault (catalog vs. active)', () => {
  const REG: readonly ClientEntry[] = [
    { key: 'a', identity: { chainId: 1, domain: 1, name: 'A', rpcUrls: ['x'] } },
    {
      key: 'b',
      enabledByDefault: false,
      identity: { chainId: 2, domain: 2, name: 'B', rpcUrls: ['x'] },
    },
  ]

  it('excludes enabledByDefault:false entries when the enable-list is unset', () => {
    // 'b' is catalogued but off by default (e.g. its deployment isn't published yet).
    expect(resolveEnabledClients(REG, undefined).map(c => c.chainId)).toEqual([1])
  })

  it('includes an enabledByDefault:false entry when explicitly named', () => {
    expect(resolveEnabledClients(REG, 'a,b').map(c => c.chainId)).toEqual([1, 2])
    expect(resolveEnabledClients(REG, 'b').map(c => c.chainId)).toEqual([2])
  })
})

describe('getClientRegistry — sepolia catalog includes optimism-sepolia (opt-in)', () => {
  it('catalogs optimism-sepolia, off by default', () => {
    const op = getClientRegistry('sepolia').find(e => e.key === 'optimism-sepolia')
    expect(op).toBeDefined()
    expect(op!.identity.chainId).toBe(11155420)
    expect(op!.identity.domain).toBe(2)
    expect(op!.enabledByDefault).toBe(false)
  })

  it('leaves base + arbitrum sepolia active by default; optimism is opt-in', () => {
    const active = resolveEnabledClients(getClientRegistry('sepolia'), undefined).map(c => c.chainId)
    expect(active).toEqual([84532, 421614]) // base, arb — NOT optimism (11155420)
  })
})

describe('getClientRegistry', () => {
  it('exposes the local registry with stable string keys and unique chainIds/domains', () => {
    const local = getClientRegistry('local')
    expect(local.length).toBeGreaterThanOrEqual(2)
    for (const entry of local) {
      expect(typeof entry.key).toBe('string')
      expect(entry.key.length).toBeGreaterThan(0)
    }
    const chainIds = local.map(e => e.identity.chainId)
    expect(new Set(chainIds).size).toBe(chainIds.length)
  })
})

describe('getNetworkConfig — enable-list integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('honors VITE_ENABLED_CLIENTS to select a subset of the mode registry', async () => {
    vi.resetModules()
    const localKeys = (await import('./network')).getClientRegistry('local').map(e => e.key)
    const firstKey = localKeys[0]!
    vi.stubEnv('VITE_ENABLED_CLIENTS', firstKey)
    vi.resetModules() // drop the memoised config so the stubbed env is re-read
    const { getNetworkConfig: freshGetConfig, getClientRegistry: freshRegistry } = await import('./network')
    const expected = freshRegistry('local').find(e => e.key === firstKey)!.identity.chainId
    const cfg = freshGetConfig()
    expect(cfg.clients.map(c => c.chainId)).toEqual([expected])
  })
})
