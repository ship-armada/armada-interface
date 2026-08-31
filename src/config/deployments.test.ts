// ABOUTME: Tests for the deployment manifest loaders — single-flight dedup of concurrent calls (one
// ABOUTME: fetch per burst) and preserved retry-on-transient-failure semantics.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mutable network stub driven per-test. `config` is what getNetworkConfig() returns; `prefixes` maps
// a chainId → its deployment prefix (mirrors network.ts::getDeploymentPrefix). Default: a minimal
// local config with no clients → loadDeployments fetches just the hub manifest (clean single-flight
// assertions). vi.hoisted so the mock factory (hoisted above imports) can close over it safely.
const h = vi.hoisted(() => ({
  state: {
    config: { mode: 'local' as string, hub: { chainId: 31337 }, clients: [] as Array<{ chainId: number }> },
    prefixes: { 31337: 'hub' } as Record<number, string>,
  },
}))

vi.mock('./network', () => ({
  getNetworkConfig: () => h.state.config,
  getDeploymentPrefix: (chainId: number) => h.state.prefixes[chainId],
}))

const okJson = (body: unknown) => ({ ok: true, json: async () => body })

beforeEach(() => {
  vi.resetModules() // fresh module-level cache/pending state per test
  // Reset the network stub to the default hub-only local config so tests don't leak into each other.
  h.state.config = { mode: 'local', hub: { chainId: 31337 }, clients: [] }
  h.state.prefixes = { 31337: 'hub' }
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadYieldDeployment — single-flight', () => {
  it('coalesces concurrent calls into one fetch', async () => {
    const fetchMock = vi.fn(async () => okJson({ contracts: { armadaYieldVault: '0xvault' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadYieldDeployment } = await import('./deployments')

    const [a, b, c] = await Promise.all([loadYieldDeployment(), loadYieldDeployment(), loadYieldDeployment()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).not.toBeNull()
  })

  it('retries after a transient failure — a failure is not cached', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(okJson({ contracts: { armadaYieldVault: '0xvault' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadYieldDeployment } = await import('./deployments')

    expect(await loadYieldDeployment()).toBeNull() // transient failure → null, not cached
    expect(await loadYieldDeployment()).not.toBeNull() // next call re-fetches and succeeds
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('loadDeployments — single-flight', () => {
  it('coalesces concurrent calls (hub manifest fetched once, not per caller)', async () => {
    const fetchMock = vi.fn(async () => okJson({ contracts: {}, deployBlock: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadDeployments } = await import('./deployments')

    const [a, b, c] = await Promise.all([loadDeployments(), loadDeployments(), loadDeployments()])

    expect(fetchMock).toHaveBeenCalledTimes(1) // clients: [] → only the hub manifest, once
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

describe('loadDeployments — n-client manifest naming', () => {
  // Capture the URLs fetched, in order, so we can assert on names + sequence.
  const stubFetchCapturing = (urls: string[]) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return okJson({ contracts: {} })
      }),
    )

  it('fetches privacy-pool-<prefix>.json for hub + each client, in registry order (N=3)', async () => {
    h.state.config = {
      mode: 'local',
      hub: { chainId: 31337 },
      clients: [{ chainId: 31338 }, { chainId: 31339 }, { chainId: 31340 }],
    }
    h.state.prefixes = { 31337: 'hub', 31338: 'client1', 31339: 'client2', 31340: 'client3' }
    const urls: string[] = []
    stubFetchCapturing(urls)
    const { loadDeployments } = await import('./deployments')

    const result = await loadDeployments()

    expect(urls).toEqual([
      '/api/deployments/privacy-pool-hub.json',
      '/api/deployments/privacy-pool-client1.json',
      '/api/deployments/privacy-pool-client2.json',
      '/api/deployments/privacy-pool-client3.json',
    ])
    expect(result.clients).toHaveLength(3)
  })

  it('keys manifests by stable prefix, not the post-enable-list array index', async () => {
    // client1 disabled via VITE_ENABLED_CLIENTS → cfg.clients holds only client2 + client3.
    // Manifest names must follow the prefixes (client2/client3), NOT array positions (client1/client2).
    h.state.config = {
      mode: 'local',
      hub: { chainId: 31337 },
      clients: [{ chainId: 31339 }, { chainId: 31340 }],
    }
    h.state.prefixes = { 31337: 'hub', 31339: 'client2', 31340: 'client3' }
    const urls: string[] = []
    stubFetchCapturing(urls)
    const { loadDeployments } = await import('./deployments')

    await loadDeployments()

    expect(urls).toEqual([
      '/api/deployments/privacy-pool-hub.json',
      '/api/deployments/privacy-pool-client2.json',
      '/api/deployments/privacy-pool-client3.json',
    ])
  })

  it('applies the -sepolia suffix in sepolia mode', async () => {
    h.state.config = { mode: 'sepolia', hub: { chainId: 11155111 }, clients: [{ chainId: 84532 }] }
    h.state.prefixes = { 11155111: 'hub', 84532: 'client1' }
    const urls: string[] = []
    stubFetchCapturing(urls)
    const { loadDeployments } = await import('./deployments')

    await loadDeployments()

    expect(urls).toEqual([
      '/api/deployments/privacy-pool-hub-sepolia.json',
      '/api/deployments/privacy-pool-client1-sepolia.json',
    ])
  })
})
