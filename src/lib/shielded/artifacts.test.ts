// ABOUTME: Tests for preloadArtifactsFromOrigin — warms the common shapes into the registry via the
// ABOUTME: verified circuitFetch loader; a per-variant failure is swallowed (never aborts or throws).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ensureCircuitLoadedMock = vi.hoisted(() => vi.fn())
vi.mock('./circuitFetch', () => ({ ensureCircuitLoaded: ensureCircuitLoadedMock }))

import { preloadArtifactsFromOrigin } from './artifacts'

describe('preloadArtifactsFromOrigin', () => {
  beforeEach(() => {
    ensureCircuitLoadedMock.mockReset()
  })

  it('warms each common variant by its padded NNxMM key', async () => {
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
    await preloadArtifactsFromOrigin()
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['01x02', '01x03', '02x02', '02x03'])
  })

  it('swallows a per-variant failure without aborting the rest or throwing', async () => {
    ensureCircuitLoadedMock.mockImplementation(async (key: string) => {
      if (key === '02x02') throw new Error('host 500')
    })
    await expect(preloadArtifactsFromOrigin()).resolves.toBeUndefined()
    // All four are still attempted (fire-and-forget, independent).
    expect(ensureCircuitLoadedMock).toHaveBeenCalledTimes(4)
  })
})
