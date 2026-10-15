// ABOUTME: Post-build check (#92) — the production bundle must carry @armada/sdk's inlined WASM (Poseidon +
// ABOUTME: curve25519) exactly once. Two copies mean a second engine was bundled (e.g. a subpath import).

// Usage: node scripts/check-sdk-bundle.mjs [distDir]   (default: dist)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const WASM_DATA_URL = 'data:application/wasm;base64'
// One engine copy inlines exactly two WASM modules: Poseidon and curve25519.
const EXPECTED = 2

const dist = process.argv[2] ?? 'dist'

function jsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return jsFiles(path)
    return entry.endsWith('.js') ? [path] : []
  })
}

let total = 0
const hits = []
for (const file of jsFiles(join(dist, 'assets'))) {
  const count = readFileSync(file, 'utf8').split(WASM_DATA_URL).length - 1
  if (count > 0) {
    total += count
    hits.push(`  ${relative(dist, file)}: ${count} (${(statSync(file).size / 1e6).toFixed(2)} MB)`)
  }
}

const summary = `check-sdk-bundle: ${total} inlined WASM payloads (expected ${EXPECTED})`
if (total !== EXPECTED) {
  console.error(`${summary} — the SDK engine is bundled ${total > EXPECTED ? 'more than once' : 'zero times'}:`)
  if (hits.length > 0) console.error(hits.join('\n'))
  process.exit(1)
}
console.log(`${summary}:\n${hits.join('\n')}`)
