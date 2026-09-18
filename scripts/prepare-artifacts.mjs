// ABOUTME: Prebuild guard for ZK circuit artifacts. With a remote host (VITE_ARTIFACTS_BASE_URL) set,
// ABOUTME: they're fetched at runtime — no-op. For a same-origin build, verify the common shapes are present.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dest = path.resolve(__dirname, '../public/artifacts')

// A deploy that points at a hosted circuits release (Cloudflare R2 / relayer VPS) serves every shape
// from that origin at runtime, integrity-verified against src/config/circuits.manifest.json — the build
// needs no local artifacts. Same-origin builds fall back to public/artifacts, so verify the common
// shapes exist there (heavy/rare shapes lazy-load and aren't required at build time).
if (process.env.VITE_ARTIFACTS_BASE_URL) {
  console.log(`Artifacts served from ${process.env.VITE_ARTIFACTS_BASE_URL} — skipping local artifact check.`)
  process.exit(0)
}

// Keep in sync with PRELOAD_VARIANTS in src/lib/shielded/artifacts.ts.
const VARIANTS = ['01x02', '01x03', '02x02', '02x03']
const REQUIRED_FILES = ['circuit.wasm', 'zkey', 'vkey.json']

const missing = []
for (const variant of VARIANTS) {
  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(dest, variant, file))) missing.push(`${variant}/${file}`)
  }
}

if (missing.length > 0) {
  console.error('Missing ZK artifacts in public/artifacts:', missing.join(', '))
  console.error('Populate them with `npm run circuits:fetch`, or set VITE_ARTIFACTS_BASE_URL to a hosted release.')
  process.exit(1)
}

console.log(`Verified ${VARIANTS.length} common artifact variants in public/artifacts.`)
