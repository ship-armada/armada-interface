// ABOUTME: Unit test for the write-capable SDK wiring — the ArtifactSource resolves loaded circuits from the registry (fast
// ABOUTME: path) or lazy-loads them (#6), and both it and the prover report their timings (package 7).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the worker prover so importing this module doesn't pull the proving stack (or a Worker) into
// the test. The stub records the spawn function it is given, without calling it.
const createWorkerProverMock = vi.hoisted(() =>
  vi.fn((_spawn: () => unknown) => ({ prove: async () => ({}), verify: async () => false, close: async () => {} })),
)
// The prover takes the loaded SDK module (sdk-loader.ts); this stands in for it.
const armada = { createWorkerProver: createWorkerProverMock, webWorkerChannel: vi.fn() } as unknown as ArmadaSdkModule

// Stub the lazy loader — the ArtifactSource under test should delegate a registry miss to it.
const ensureCircuitLoadedMock = vi.hoisted(() => vi.fn())
vi.mock('./circuitFetch', () => ({ ensureCircuitLoaded: ensureCircuitLoadedMock }))

// Timing telemetry: assert what's reported (the console sink is tested in telemetry.test).
const trackMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/telemetry', () => ({ track: trackMock }))

import { createInterfaceArtifactSource, createInterfaceProver, __resetProofSessionForTests } from './sdk-prover'
import { setArmadaArtifact, clearArmadaArtifacts, type ArmadaArtifact } from './artifactGetter'
import type { ArmadaSdkModule } from './sdk-loader'

const artifact = (wasm: Uint8Array): ArmadaArtifact =>
  ({ zkey: new Uint8Array([2]), wasm, vkey: { protocol: 'groth16' } })

describe('createInterfaceArtifactSource', () => {
  beforeEach(() => {
    clearArmadaArtifacts()
    ensureCircuitLoadedMock.mockReset()
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
  })

  it('resolves a warm circuit from the registry without a fetch (fast path)', async () => {
    const wasm = new Uint8Array([1, 2, 3])
    setArmadaArtifact('01x02', artifact(wasm))
    const set = await createInterfaceArtifactSource().resolve({ nullifiers: 1, commitments: 2 })
    expect(set.wasm).toBe(wasm)
    expect(set.zkey).toEqual(new Uint8Array([2]))
    expect(set.vkey).toEqual({ protocol: 'groth16' })
    // ensureCircuitLoaded is still called (it no-ops on a warm shape), but no throw.
    expect(ensureCircuitLoadedMock).toHaveBeenCalledWith('01x02')
  })

  it('lazy-loads a shape on a registry miss, then resolves it', async () => {
    // Simulate circuitFetch populating the registry.
    const wasm = new Uint8Array([9, 9])
    ensureCircuitLoadedMock.mockImplementation(async (key: string) => {
      setArmadaArtifact(key, artifact(wasm))
    })
    const set = await createInterfaceArtifactSource().resolve({ nullifiers: 8, commitments: 4 })
    expect(ensureCircuitLoadedMock).toHaveBeenCalledWith('08x04')
    expect(set.wasm).toBe(wasm)
  })

  it('propagates a load failure (404 / integrity mismatch) as a rejection', async () => {
    ensureCircuitLoadedMock.mockRejectedValue(new Error('circuit fetch → 404'))
    await expect(
      createInterfaceArtifactSource().resolve({ nullifiers: 2, commitments: 3 }),
    ).rejects.toThrow(/404/)
  })
})

describe('createInterfaceProver', () => {
  it('hands the SDK a worker factory without starting a worker (the SDK spawns lazily and respawns)', () => {
    // WHY: the SDK's worker prover starts the worker on the first request and starts a fresh one after
    // a crash or a cancelled proof — so it needs a factory, and read-only sessions never spawn a worker.
    createWorkerProverMock.mockClear()
    const prover = createInterfaceProver(armada)
    expect(createWorkerProverMock).toHaveBeenCalledTimes(1)
    expect(typeof createWorkerProverMock.mock.calls[0]?.[0]).toBe('function')
    expect(typeof prover.prove).toBe('function')
    expect(typeof prover.close).toBe('function')
  })
})

describe('timing telemetry', () => {
  beforeEach(() => {
    clearArmadaArtifacts()
    trackMock.mockReset()
    ensureCircuitLoadedMock.mockReset()
    __resetProofSessionForTests()
  })

  it('reports each circuit resolve: its shape, duration, and whether it was already loaded', async () => {
    setArmadaArtifact('01x02', artifact(new Uint8Array([1])))
    ensureCircuitLoadedMock.mockResolvedValue(undefined)
    await createInterfaceArtifactSource().resolve({ nullifiers: 1, commitments: 2 })
    ensureCircuitLoadedMock.mockImplementation(async (key: string) => setArmadaArtifact(key, artifact(new Uint8Array([2]))))
    await createInterfaceArtifactSource().resolve({ nullifiers: 2, commitments: 3 })
    expect(trackMock.mock.calls).toEqual([
      ['sdk.artifact.resolve', { shape: '01x02', cached: true, durationMs: expect.any(Number) }],
      ['sdk.artifact.resolve', { shape: '02x03', cached: false, durationMs: expect.any(Number) }],
    ])
  })

  it('reports each proof\'s duration, flagging the first of the session (it also pays the worker start-up)', async () => {
    const prover = createInterfaceProver(armada)
    const artifacts = { wasm: new Uint8Array(), zkey: new Uint8Array(), vkey: {} }
    await prover.prove({}, artifacts)
    await prover.prove({}, artifacts)
    expect(trackMock.mock.calls).toEqual([
      ['sdk.proof', { durationMs: expect.any(Number), firstOfSession: true }],
      ['sdk.proof', { durationMs: expect.any(Number), firstOfSession: false }],
    ])
  })
})

