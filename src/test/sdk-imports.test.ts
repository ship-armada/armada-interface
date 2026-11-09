// ABOUTME: Guards production code's @armada/sdk imports: from the root, never the /core or /wallet subpaths (#92), and only
// ABOUTME: type imports outside lib/shielded/sdk-loader.ts, so the SDK stays out of the first screen's chunk (13C).

import { describe, it, expect } from 'vitest'

// Every source file's text, via Vite's raw glob (no Node fs in the jsdom test environment).
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

const SUBPATH_IMPORT = /['"]@armada\/sdk\/(core|wallet)['"]/
// A runtime import of the SDK root: a static `import … from` that isn't `import type`, or a dynamic `import(…)`.
// `[^'"]` keeps a match inside one statement: it can't run past an earlier import's quoted module name.
const RUNTIME_IMPORT = /^import\s+(?!type\b)[^'"]*?\bfrom\s*['"]@armada\/sdk['"]|\bimport\(\s*['"]@armada\/sdk['"]\s*\)/m
const LOADER = '/src/lib/shielded/sdk-loader.ts'

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

  it('recognises a runtime import, and lets type imports through', () => {
    expect(RUNTIME_IMPORT.test("import { buildShieldRequest } from '@armada/sdk'")).toBe(true)
    expect(RUNTIME_IMPORT.test("import {\n  createArmadaSdk,\n  type ArmadaSdk,\n} from '@armada/sdk'")).toBe(true)
    expect(RUNTIME_IMPORT.test("import { type Plan } from '@armada/sdk'")).toBe(true) // verbatimModuleSyntax keeps it
    expect(RUNTIME_IMPORT.test("const { decodeAddress } = await import('@armada/sdk')")).toBe(true)
    expect(RUNTIME_IMPORT.test("import type { Plan } from '@armada/sdk'")).toBe(false)
    expect(RUNTIME_IMPORT.test("import { x } from './y'\nimport type { HistoryEntry } from '@armada/sdk'")).toBe(false)
  })

  it('only sdk-loader.ts loads @armada/sdk at runtime; everything else imports types or calls loadSdk()', () => {
    // WHY: the SDK is ~8 MB (its engine + inlined WASM). Any runtime import of it in the app's graph pulls it into the
    // entry chunk, which every page — the sign-in card, a payment link — has to download and run before it shows. Through
    // loadSdk() it's a separate chunk, fetched in the background once the first screen is up (13C).
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.startsWith('/src/test/') && path !== LOADER)
      .filter(([, text]) => RUNTIME_IMPORT.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
