// ABOUTME: Tests for circuitFetch — fetch a shape's {zkey,wasm,vkey}, sha256-verify against the
// ABOUTME: manifest, populate the registry, de-dupe concurrent fetches, and skip verify when unpinned.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/config/circuits', () => ({
  artifactUrl: (shape: string, file: string) => `https://cdn.test/${shape}/${file}`,
  circuitHashes: vi.fn(),
}))

import { circuitHashes } from '@/config/circuits'
import { clearArmadaArtifacts, getArmadaArtifact } from './artifactGetter'
import { fetchCircuitShape, ensureCircuitLoaded } from './circuitFetch'

const circuitHashesMock = circuitHashes as unknown as ReturnType<typeof vi.fn>

const ZKEY = new Uint8Array([1, 2, 3])
const WASM = new Uint8Array([4, 5, 6, 7])
const VKEY_OBJ = { protocol: 'groth16', n: 8 }
const VKEY_BYTES = new TextEncoder().encode(JSON.stringify(VKEY_OBJ))

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** fetch mock returning the fixture bytes; per-file status overrides simulate a 404. */
function mockFetch(status: Partial<Record<'zkey' | 'circuit.wasm' | 'vkey.json', number>> = {}) {
  const fn = vi.fn((url: string | URL) => {
    const u = String(url)
    const which = u.endsWith('/zkey') ? 'zkey' : u.endsWith('/circuit.wasm') ? 'circuit.wasm' : 'vkey.json'
    const code = status[which] ?? 200
    if (code !== 200) return Promise.resolve(new Response(null, { status: code }))
    const body = which === 'zkey' ? ZKEY : which === 'circuit.wasm' ? WASM : VKEY_BYTES
    return Promise.resolve(new Response(body, { status: 200 }))
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

async function correctHashes() {
  return { zkey: await sha256Hex(ZKEY), wasm: await sha256Hex(WASM), vkey: await sha256Hex(VKEY_BYTES) }
}

const ORIGINAL_FETCH = globalThis.fetch

describe('circuitFetch', () => {
  beforeEach(() => {
    clearArmadaArtifacts()
    circuitHashesMock.mockReset()
  })
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('fetches, verifies against the manifest, and parses the vkey', async () => {
    circuitHashesMock.mockReturnValue(await correctHashes())
    mockFetch()
    const out = await fetchCircuitShape('08x04')
    expect(out.zkey).toEqual(ZKEY)
    expect(out.wasm).toEqual(WASM)
    expect(out.vkey).toEqual(VKEY_OBJ)
  })

  it('throws on a sha256 mismatch (tampered/corrupt artifact)', async () => {
    circuitHashesMock.mockReturnValue({ ...(await correctHashes()), zkey: 'deadbeef'.repeat(8) })
    mockFetch()
    await expect(fetchCircuitShape('08x04')).rejects.toThrow(/integrity check failed/i)
  })

  it('throws on a 404 (shape not served by this deployment)', async () => {
    circuitHashesMock.mockReturnValue(await correctHashes())
    mockFetch({ zkey: 404 })
    await expect(fetchCircuitShape('08x04')).rejects.toThrow(/→ 404/)
  })

  it('skips verification when the shape is not in the manifest (local dev circuits)', async () => {
    circuitHashesMock.mockReturnValue(undefined)
    mockFetch()
    // Arbitrary bytes, no pinned hash → must still resolve (no integrity gate).
    await expect(fetchCircuitShape('01x01')).resolves.toBeDefined()
  })

  it('de-dupes concurrent fetches of the same shape (one download each)', async () => {
    circuitHashesMock.mockReturnValue(await correctHashes())
    const fn = mockFetch()
    await Promise.all([fetchCircuitShape('08x04'), fetchCircuitShape('08x04'), fetchCircuitShape('08x04')])
    // 3 files fetched once total, not 9.
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('ensureCircuitLoaded populates the registry, then no-ops on a warm shape', async () => {
    circuitHashesMock.mockReturnValue(await correctHashes())
    const fn = mockFetch()
    await ensureCircuitLoaded('08x04')
    expect(getArmadaArtifact('08x04')?.wasm).toEqual(WASM)
    await ensureCircuitLoaded('08x04') // warm — no further fetch
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
