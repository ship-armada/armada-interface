// ABOUTME: Post-build check (13C) — the entry chunk (the script index.html loads first, before anything renders) must stay under
// ABOUTME: its budget, so the SDK can't creep back into it; also reports the largest chunks (console + GitHub job summary).

// Usage: node scripts/check-entry-size.mjs [distDir] [budgetBytes]   (defaults: dist, ENTRY_BUDGET_BYTES)

import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The entry chunk was 2.82 MB once the SDK loaded lazily (sdk-loader.ts); this leaves ~17% for normal growth. Raise it
// deliberately, with a reason, rather than to make CI pass.
const ENTRY_BUDGET_BYTES = 3_300_000
const REPORT_TOP = 12

const dist = process.argv[2] ?? 'dist'
const budget = Number(process.argv[3] ?? ENTRY_BUDGET_BYTES)

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/)
if (!entryMatch) {
  console.error('check-entry-size: index.html loads no module script — is this a Vite build output?')
  process.exit(1)
}
const entry = entryMatch[1]
const entrySize = statSync(join(dist, entry)).size

const chunks = readdirSync(join(dist, 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, size: statSync(join(dist, 'assets', name)).size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, REPORT_TOP)

const label = (name) => (`assets/${name}` === entry ? `${name} (entry)` : name)
const summary = `check-entry-size: entry chunk ${entry}: ${kb(entrySize)} (budget ${kb(budget)})`
const table = chunks.map((c) => `  ${label(c.name).padEnd(48)} ${kb(c.size)}`).join('\n')

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = chunks.map((c) => `| \`${label(c.name)}\` | ${kb(c.size)} |`).join('\n')
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Bundle\n\nEntry chunk: **${kb(entrySize)}** (budget ${kb(budget)})\n\n| Chunk | Size |\n|---|---|\n${rows}\n`,
  )
}

if (entrySize > budget) {
  console.error(`${summary} — over its budget. Something heavy is in the first screen's chunk again (a runtime import of`)
  console.error('@armada/sdk outside sdk-loader.ts?). Largest chunks:')
  console.error(table)
  process.exit(1)
}
console.log(`${summary}\nLargest chunks:\n${table}`)
