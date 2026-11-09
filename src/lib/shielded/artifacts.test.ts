// ABOUTME: Tests for preloadArtifactsFromOrigin / warmPlannedCircuits — warm circuit shapes via the verified circuitFetch
// ABOUTME: loader (the two common ones after sign-in, one at a time; a plan's own once known); failures are swallowed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ensureCircuitLoadedMock = vi.hoisted(() => vi.fn())
vi.mock('./circuitFetch', () => ({ ensureCircuitLoaded: ensureCircuitLoadedMock }))

import { preloadArtifactsFromOrigin, warmPlannedCircuits } from './artifacts'

describe('preloadArtifactsFromOrigin', () => {
  beforeEach(() => {
    ensureCircuitLoadedMock.mockReset()
  })

  it('warms only the shapes a typical spend uses — 1 or 2 inputs, with change and the relayer fee', async () => {
    // WHY: the x2 shapes (whole-balance sends, merges) are warmed by the spend's own plan when it needs them; preloading
    // all four cost a first-time visitor ~65 MB instead of ~33 MB.
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
    await preloadArtifactsFromOrigin()
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['01x03', '02x03'])
  })

  it('downloads them one at a time, so the first is ready sooner than if they shared the connection', async () => {
    let finishFirst: () => void = () => {}
    ensureCircuitLoadedMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
    const preload = preloadArtifactsFromOrigin()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['01x03'])
    finishFirst()
    await preload
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['01x03', '02x03'])
  })

  it('swallows a failed shape and still warms the next, without throwing', async () => {
    ensureCircuitLoadedMock.mockImplementation(async (key: string) => {
      if (key === '01x03') throw new Error('host 500')
    })
    await expect(preloadArtifactsFromOrigin()).resolves.toBeUndefined()
    expect(ensureCircuitLoadedMock.mock.calls.map((c) => c[0])).toEqual(['01x03', '02x03'])
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
