/// <reference types="node" />
// ABOUTME: Tests scripts/check-sdk-bundle.mjs (#92) against temp build outputs — the production bundle must
// ABOUTME: carry the SDK's inlined WASM (Poseidon + curve25519) exactly once, i.e. one engine copy.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(__dirname, '../../scripts/check-sdk-bundle.mjs')
const WASM_URL = 'data:application/wasm;base64,AGFzbQEAAAA'

let dist: string
const asset = (name: string, body: string): void => writeFileSync(join(dist, 'assets', name), body)

function check(): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(process.execPath, [SCRIPT, dist], { encoding: 'utf8', stdio: 'pipe' }) }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status, output: e.stdout + e.stderr }
  }
}

describe('check-sdk-bundle (#92)', () => {
  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'sdk-bundle-'))
    mkdirSync(join(dist, 'assets'))
    asset('app.js', 'console.log(1)')
  })
  afterEach(() => {
    rmSync(dist, { recursive: true, force: true })
  })

  it('passes with one engine copy (two inlined WASM payloads)', () => {
    asset('sdk.js', `a("${WASM_URL}");b("${WASM_URL}")`)
    const result = check()
    expect(result.code).toBe(0)
    expect(result.output).toMatch(/2 inlined WASM payloads/)
  })

  it('fails when the engine is bundled twice (four payloads), naming the files', () => {
    asset('sdk-root.js', `a("${WASM_URL}");b("${WASM_URL}")`)
    asset('sdk-core.js', `a("${WASM_URL}");b("${WASM_URL}")`)
    const result = check()
    expect(result.code).toBe(1)
    expect(result.output).toContain('sdk-root.js')
    expect(result.output).toContain('sdk-core.js')
  })

  it('fails when no SDK WASM is found (the check would otherwise pass vacuously)', () => {
    const result = check()
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/0 inlined WASM payloads/)
  })
})
