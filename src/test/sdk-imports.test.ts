// ABOUTME: Guards that production code imports @armada/sdk from its root, never the /core or /wallet subpaths
// ABOUTME: (#92) — those entries share the root's engine, so the root has everything app code needs.

import { describe, it, expect } from 'vitest'

// Every source file's text, via Vite's raw glob (no Node fs in the jsdom test environment).
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

const SUBPATH_IMPORT = /['"]@armada\/sdk\/(core|wallet)['"]/

describe('@armada/sdk imports (#92)', () => {
  it('production code imports @armada/sdk from the root, not /core or /wallet', () => {
    // WHY: the app used `await import('@armada/sdk/core')` for decodeAddress, which (before the SDK shared one
    // engine chunk across entries) loaded a second copy of the engine and its WASM. The root now exports the
    // address codec. Tests may use /core for engine-level types (TransactNote, OutputType) that aren't on the root.
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx?$/.test(path))
      .filter(([, text]) => SUBPATH_IMPORT.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
