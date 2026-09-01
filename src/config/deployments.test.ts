// ABOUTME: Tests for the deployment manifest loaders — single-flight dedup, retry-on-transient-failure,
// ABOUTME: and client-manifest discovery that binds by embedded chainId (robust to ordinal/instance changes).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mutable network stub driven per-test. `config` is what getNetworkConfig() returns. Default: a
// minimal local config with no clients → loadDeployments fetches the hub manifest then probes for a
// (missing) client1. vi.hoisted so the mock factory (hoisted above imports) can close over it safely.
const h = vi.hoisted(() => ({
  state: {
    config: {
      mode: 'local' as string,
      hub: { chainId: 31337 },
      clients: [] as Array<{ chainId: number; name?: string }>,
    },
  },
}))

vi.mock('./network', () => ({
  getNetworkConfig: () => h.state.config,
}))

const okJson = (body: unknown) => ({ ok: true, json: async () => body })
const notFound = () => ({ ok: false, status: 404, json: async () => ({}) })

/** URL-aware fetch stub: maps a manifest filename → body. A name absent from the map returns 404. */
function stubFetchByName(byName: Record<string, unknown | undefined>) {
  const fetchMock = vi.fn(async (url: string) => {
    const name = String(url).replace('/api/deployments/', '')
    const body = byName[name]
    return body === undefined ? notFound() : okJson(body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const namesFetched = (fetchMock: ReturnType<typeof stubFetchByName>) =>
  fetchMock.mock.calls.map(([u]) => String(u))

beforeEach(() => {
  vi.resetModules() // fresh module-level cache/pending state per test
  // Reset the network stub to the default hub-only local config so tests don't leak into each other.
  h.state.config = { mode: 'local', hub: { chainId: 31337 }, clients: [] }
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
  it('coalesces concurrent calls onto one load (hub fetched once, not per caller)', async () => {
    const fetchMock = stubFetchByName({ 'privacy-pool-hub.json': { chainId: 31337, contracts: {} } })
    const { loadDeployments } = await import('./deployments')

    const [a, b, c] = await Promise.all([loadDeployments(), loadDeployments(), loadDeployments()])

    expect(a).toBe(b)
    expect(b).toBe(c)
    // Single-flight: the hub manifest is requested once across the 3 concurrent callers, not 3×.
    const hubCalls = namesFetched(fetchMock).filter(u => u.includes('privacy-pool-hub.json'))
    expect(hubCalls).toHaveLength(1)
  })
})

describe('loadDeployments — binds client manifests by embedded chainId', () => {
  it('binds each client by its embedded chainId, independent of the ordinal file position', async () => {
    // Registry order is [Base 84532, Arb 421614], but the deployment put Arb in the client1 slot and
    // Base in client2. Binding must follow the embedded chainId, not the ordinal — the reordering case.
    h.state.config = {
      mode: 'local',
      hub: { chainId: 31337 },
      clients: [{ chainId: 84532, name: 'Base' }, { chainId: 421614, name: 'Arb' }],
    }
    stubFetchByName({
      'privacy-pool-hub.json': { chainId: 31337, contracts: {} },
      'privacy-pool-client1.json': { chainId: 421614, contracts: {} },
      'privacy-pool-client2.json': { chainId: 84532, contracts: {} },
    })
    const { loadDeployments } = await import('./deployments')

    const result = await loadDeployments()

    expect(result.clients.map(c => c.chainId)).toEqual([84532, 421614]) // registry order, correct binding
  })

  it('skips an enabled client with no deployed manifest instead of failing the whole load', async () => {
    // demo3-like: Base + Optimism deployed, Arbitrum enabled in the registry but absent from this instance.
    h.state.config = {
      mode: 'local',
      hub: { chainId: 31337 },
      clients: [
        { chainId: 84532, name: 'Base' },
        { chainId: 421614, name: 'Arb' },
        { chainId: 11155420, name: 'Optimism' },
      ],
    }
    stubFetchByName({
      'privacy-pool-hub.json': { chainId: 31337, contracts: {} },
      'privacy-pool-client1.json': { chainId: 84532, contracts: {} },
      'privacy-pool-client2.json': { chainId: 11155420, contracts: {} },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loadDeployments } = await import('./deployments')

    const result = await loadDeployments()

    expect(result.clients.map(c => c.chainId)).toEqual([84532, 11155420]) // Arb (421614) skipped, no throw
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('421614'))
    warn.mockRestore()
  })

  it('probes contiguous client<i> files and stops at the first gap', async () => {
    h.state.config = { mode: 'local', hub: { chainId: 31337 }, clients: [{ chainId: 84532 }] }
    const fetchMock = stubFetchByName({
      'privacy-pool-hub.json': { chainId: 31337, contracts: {} },
      'privacy-pool-client1.json': { chainId: 84532, contracts: {} },
      // client2 missing → probing stops; client3 exists but must never be reached past the gap.
      'privacy-pool-client3.json': { chainId: 99999, contracts: {} },
    })
    const { loadDeployments } = await import('./deployments')

    await loadDeployments()

    const names = namesFetched(fetchMock)
    expect(names.some(u => u.includes('privacy-pool-client1.json'))).toBe(true)
    expect(names.some(u => u.includes('privacy-pool-client2.json'))).toBe(true) // the probed gap
    expect(names.some(u => u.includes('privacy-pool-client3.json'))).toBe(false) // not probed past the gap
  })

  it('probes -sepolia suffixed names in sepolia mode', async () => {
    h.state.config = { mode: 'sepolia', hub: { chainId: 11155111 }, clients: [{ chainId: 84532 }] }
    const fetchMock = stubFetchByName({
      'privacy-pool-hub-sepolia.json': { chainId: 11155111, contracts: {} },
      'privacy-pool-client1-sepolia.json': { chainId: 84532, contracts: {} },
    })
    const { loadDeployments } = await import('./deployments')

    await loadDeployments()

    const names = namesFetched(fetchMock)
    expect(names).toContain('/api/deployments/privacy-pool-hub-sepolia.json')
    expect(names).toContain('/api/deployments/privacy-pool-client1-sepolia.json')
  })
})
