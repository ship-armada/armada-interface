// ABOUTME: Tests for preloadArtifactsFromOrigin / preloadArtifactsAfterSdk / warmPlannedCircuits — warm circuit shapes via the
// ABOUTME: verified circuitFetch loader (the common ones once the SDK is in; a plan's own once known); failures are swallowed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ensureCircuitLoadedMock = vi.hoisted(() => vi.fn())
vi.mock('./circuitFetch', () => ({ ensureCircuitLoaded: ensureCircuitLoadedMock }))

// The SDK's load, controlled per test: whenSdkLoaded resolves when the test says the SDK is in.
const sdk = vi.hoisted(() => ({ markLoaded: () => {}, loaded: Promise.resolve() }))
vi.mock('./sdk-loader', () => ({ whenSdkLoaded: () => sdk.loaded }))

import { preloadArtifactsFromOrigin, preloadArtifactsAfterSdk, warmPlannedCircuits } from './artifacts'

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

describe('preloadArtifactsAfterSdk', () => {
  beforeEach(() => {
    ensureCircuitLoadedMock.mockReset()
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
    sdk.loaded = new Promise<void>((resolve) => {
      sdk.markLoaded = resolve
    })
  })

  it('starts the circuit downloads only once the SDK has loaded', async () => {
    // WHY: the circuits are ~65 MB; downloading them alongside the SDK on a slow phone held sign-in back ~24s.
    const preload = preloadArtifactsAfterSdk()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ensureCircuitLoadedMock).not.toHaveBeenCalled()
    sdk.markLoaded()
    await preload
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['01x02', '01x03', '02x02', '02x03'])
  })
})

describe('warmPlannedCircuits', () => {
  beforeEach(() => {
    ensureCircuitLoadedMock.mockReset()
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
  })

  it('starts loading each distinct shape a plan will prove, by its padded key', async () => {
    const shape = (nullifiers: number, commitments: number) => ({ shape: { nullifiers, commitments } })
    // A 2-proof split whose groups share a shape, plus a swept 4x3: two distinct circuits.
    await warmPlannedCircuits([shape(4, 3), shape(4, 3), shape(1, 2)])
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['04x03', '01x02'])
  })

  it('never throws — a failed download surfaces later, when the proof needs the circuit', async () => {
    ensureCircuitLoadedMock.mockRejectedValue(new Error('host 500'))
    await expect(warmPlannedCircuits([{ shape: { nullifiers: 4, commitments: 3 } }])).resolves.toBeUndefined()
  })
})
