// ABOUTME: Tests for the indexer health client — URL resolution, /health probe path building, and
// ABOUTME: status handling (reachable on 2xx, throw otherwise, throw when unconfigured).

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

// Control the resolved indexer URL per test without touching the real env-driven network config.
const mockCfg = vi.hoisted(() => ({ indexerUrl: 'https://idx.test/indexer' as string | null }))
vi.mock('@/config/network', () => ({
  getNetworkConfig: () => ({ indexerUrl: mockCfg.indexerUrl }),
}))

import { fetchIndexerHealth, isIndexerConfigured, getIndexerUrl } from './indexer'

describe('indexer health client', () => {
  const fetchMock = vi.fn()
  const ORIGINAL_FETCH = globalThis.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    mockCfg.indexerUrl = 'https://idx.test/indexer'
  })
  afterAll(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('reflects the configured URL via getIndexerUrl / isIndexerConfigured', () => {
    expect(getIndexerUrl()).toBe('https://idx.test/indexer')
    expect(isIndexerConfigured()).toBe(true)
    mockCfg.indexerUrl = null
    expect(getIndexerUrl()).toBeNull()
    expect(isIndexerConfigured()).toBe(false)
  })

  it('probes {base}/health and resolves reachable on a 2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))
    await expect(fetchIndexerHealth()).resolves.toEqual({ reachable: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://idx.test/indexer/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('strips a trailing slash from the base before appending /health', async () => {
    mockCfg.indexerUrl = 'https://idx.test/indexer/'
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))
    await fetchIndexerHealth()
    expect(fetchMock).toHaveBeenCalledWith('https://idx.test/indexer/health', expect.anything())
  })

  it('throws on a non-2xx status (surfaces as unreachable to the hook)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(fetchIndexerHealth()).rejects.toThrow(/502/)
  })

  it('throws without fetching when no indexer is configured', async () => {
    mockCfg.indexerUrl = null
    await expect(fetchIndexerHealth()).rejects.toThrow(/not configured/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
