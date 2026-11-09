/// <reference types="node" />
// ABOUTME: Tests scripts/check-entry-size.mjs (13C) against temp build outputs — the chunk index.html loads first must stay under
// ABOUTME: its budget (so the SDK can't creep back into it); it reports the largest chunks either way.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(__dirname, '../../scripts/check-entry-size.mjs')

let dist: string
const asset = (name: string, bytes: number): void => writeFileSync(join(dist, 'assets', name), 'x'.repeat(bytes))
const html = (entry: string): void =>
  writeFileSync(join(dist, 'index.html'), `<html><head><script type="module" crossorigin src="/assets/${entry}"></script></head></html>`)

function check(budgetBytes: number, env: Record<string, string> = {}): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [SCRIPT, dist, String(budgetBytes)], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, GITHUB_STEP_SUMMARY: '', ...env },
    })
    return { code: 0, output }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status, output: e.stdout + e.stderr }
  }
}

describe('check-entry-size (13C)', () => {
  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'entry-size-'))
    mkdirSync(join(dist, 'assets'))
    asset('index-abc.js', 1_000)
    asset('sdk-def.js', 9_000)
    html('index-abc.js')
  })
  afterEach(() => {
    rmSync(dist, { recursive: true, force: true })
  })

  it('passes when the entry chunk is under budget, and lists the largest chunks', () => {
    const result = check(2_000)
    expect(result.code).toBe(0)
    expect(result.output).toMatch(/entry chunk assets\/index-abc\.js: 1\.0 kB \(budget 2\.0 kB\)/)
    expect(result.output.indexOf('sdk-def.js')).toBeLessThan(result.output.indexOf('index-abc.js (entry)'))
  })

  it('fails when the entry chunk grows past its budget (e.g. the SDK pulled back in)', () => {
    asset('index-abc.js', 3_000)
    const result = check(2_000)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/over its budget/)
  })

  it('fails when index.html loads no entry script', () => {
    writeFileSync(join(dist, 'index.html'), '<html></html>')
    expect(check(2_000).code).toBe(1)
  })

  it('writes the report to the GitHub job summary when there is one', () => {
    const summary = join(dist, 'summary.md')
    writeFileSync(summary, '')
    check(2_000, { GITHUB_STEP_SUMMARY: summary })
    expect(readFileSync(summary, 'utf8')).toMatch(/\| `sdk-def\.js` \|/)
  })
})
