/// <reference types="node" />
// ABOUTME: Tests scripts/publish-circuits.mjs end to end against a tiny fake release — it normalizes the layout, verifies
// ABOUTME: every file against SHA256SUMS, and writes a gzip copy of each zkey / WASM for nginx's gzip_static (#147).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const SCRIPT = resolve(__dirname, '../../scripts/publish-circuits.mjs')

let root: string
let release: string
let dest: string
const sha = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

// One shape in the release tarball's layout (NxM/final.zkey, NxM/main_NxM_js/main_NxM.wasm, NxM/vkey.json) + its sums.
function fakeRelease(shape: string, files: { zkey: string; wasm: string; vkey: string }, corrupt = false): string {
  const paths = {
    zkey: `${shape}/final.zkey`,
    wasm: `${shape}/main_${shape}_js/main_${shape}.wasm`,
    vkey: `${shape}/vkey.json`,
  }
  mkdirSync(join(release, `${shape}/main_${shape}_js`), { recursive: true })
  for (const key of ['zkey', 'wasm', 'vkey'] as const) writeFileSync(join(release, paths[key]), files[key])
  const sums = (['zkey', 'wasm', 'vkey'] as const)
    .map((key) => `${corrupt && key === 'zkey' ? sha('other') : sha(files[key])}  ./${paths[key]}`)
    .join('\n')
  const sumsPath = join(root, 'SHA256SUMS')
  writeFileSync(sumsPath, sums + '\n')
  return sumsPath
}

function publish(sumsPath: string): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [SCRIPT, '--from', release, '--sums', sumsPath, '--no-manifest', '--dest', dest], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { code: 0, output }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status, output: e.stdout + e.stderr }
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'publish-circuits-test-'))
  release = join(root, 'extracted')
  dest = join(root, 'dest')
  mkdirSync(release)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('publish-circuits', () => {
  const files = { zkey: 'z'.repeat(5000), wasm: 'w'.repeat(3000), vkey: '{"protocol":"groth16"}' }

  it('normalizes a shape into NNxMM/{zkey,circuit.wasm,vkey.json}', () => {
    const { code, output } = publish(fakeRelease('1x3', files))
    expect(code, output).toBe(0)
    expect(readFileSync(join(dest, '01x03/zkey'), 'utf8')).toBe(files.zkey)
    expect(readFileSync(join(dest, '01x03/circuit.wasm'), 'utf8')).toBe(files.wasm)
    expect(readFileSync(join(dest, '01x03/vkey.json'), 'utf8')).toBe(files.vkey)
  })

  it('writes a gzip copy of the zkey and WASM that decompresses to the exact verified bytes', () => {
    // WHY: nginx serves <file>.gz to clients that accept gzip (gzip_static), roughly halving each circuit download; the
    // app hashes the decoded bytes, so the copy must match the original exactly. Writing it here means rsync --delete
    // deploys it rather than deleting a hand-made one.
    expect(publish(fakeRelease('1x3', files)).code).toBe(0)
    expect(gunzipSync(readFileSync(join(dest, '01x03/zkey.gz'))).toString()).toBe(files.zkey)
    expect(gunzipSync(readFileSync(join(dest, '01x03/circuit.wasm.gz'))).toString()).toBe(files.wasm)
    expect(existsSync(join(dest, '01x03/vkey.json.gz'))).toBe(false)
  })

  it('refuses a release whose file doesn\'t match SHA256SUMS, deploying nothing', () => {
    const { code, output } = publish(fakeRelease('1x3', files, true))
    expect(code).not.toBe(0)
    expect(output).toMatch(/Integrity check failed/)
    expect(existsSync(dest)).toBe(false)
  })
})
