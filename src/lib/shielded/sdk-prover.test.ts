// ABOUTME: Unit test for the write-capable SDK wiring — the ArtifactSource resolves loaded circuits from
// ABOUTME: the registry (fast path) and lazy-loads any other shape via circuitFetch on a miss (#6).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the worker prover so importing this module doesn't pull the proving stack (or a Worker) into
// the test. createInterfaceProver is lazy, so createWorkerProver isn't invoked until first prove().
vi.mock('@armada/sdk', () => ({
  createWorkerProver: () => ({ prove: async () => ({}), verify: async () => false, close: async () => {} }),
}))

// Stub the lazy loader — the ArtifactSource under test should delegate a registry miss to it.
const ensureCircuitLoadedMock = vi.hoisted(() => vi.fn())
vi.mock('./circuitFetch', () => ({ ensureCircuitLoaded: ensureCircuitLoadedMock }))

import { createInterfaceArtifactSource, createInterfaceProver } from './sdk-prover'
import { setArmadaArtifact, clearArmadaArtifacts, type ArmadaArtifact } from './artifactGetter'

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
  it('returns a ProverAdapter (snarkjs backend)', () => {
    const prover = createInterfaceProver()
    expect(typeof prover.prove).toBe('function')
    expect(typeof prover.close).toBe('function')
  })
})
