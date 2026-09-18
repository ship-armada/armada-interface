// ABOUTME: Generates src/config/circuits.manifest.json (shape → sha256 of zkey/wasm/vkey) from an
// ABOUTME: armada-circuits release SHA256SUMS. The manifest is the integrity anchor for runtime fetches.

// Usage:
//   node scripts/gen-circuits-manifest.mjs --tag v0.1.0-dev [--sums <path>] [--out <path>]
//
// When --sums is omitted, downloads SHA256SUMS from the release via `gh`. The three files we serve
// per shape are `final.zkey` (→ zkey), `main_NxM_js/main_NxM.wasm` (→ circuit.wasm) and `vkey.json`;
// renaming doesn't change bytes, so the release hashes are exactly what the browser verifies.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CIRCUITS_REPO = 'ship-armada/armada-circuits'
const DEFAULT_OUT = 'src/config/circuits.manifest.json'

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--tag') args.tag = argv[++i]
    else if (flag === '--sums') args.sums = argv[++i]
    else if (flag === '--out') args.out = argv[++i]
    else throw new Error(`Unknown argument: ${flag}`)
  }
  if (!args.tag) throw new Error('Missing required --tag <release-tag>')
  return args
}

/** Download SHA256SUMS for a release tag into a temp dir and return its contents. */
function downloadSums(tag) {
  const dir = mkdtempSync(join(tmpdir(), 'armada-circuits-'))
  execFileSync('gh', ['release', 'download', tag, '-R', CIRCUITS_REPO, '-p', 'SHA256SUMS', '-D', dir], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return readFileSync(join(dir, 'SHA256SUMS'), 'utf8')
}

/** Pad an unpadded release shape ("1x2") to the interface's registry key ("01x02"). */
function paddedShape(shape) {
  const [n, m] = shape.split('x')
  return `${n.padStart(2, '0')}x${m.padStart(2, '0')}`
}

/**
 * Build { "NNxMM": { zkey, wasm, vkey } } from the SHA256SUMS. Each line is `<hash>  ./<shape>/<rest>`.
 * We pick exactly the three runtime files per shape; a shape missing any of them is a hard error
 * (an incomplete release must not silently yield an unverifiable artifact).
 */
function buildShapes(sums) {
  const byShape = new Map() // shape → { zkey?, wasm?, vkey? }
  for (const line of sums.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([0-9a-f]{64})\s+\.\/(.+)$/)
    if (!match) continue
    const [, hash, path] = match
    const [shape, ...rest] = path.split('/')
    const file = rest.join('/')
    const entry = byShape.get(shape) ?? {}
    if (file === 'final.zkey') entry.zkey = hash
    else if (file === 'vkey.json') entry.vkey = hash
    else if (file === `main_${shape}_js/main_${shape}.wasm`) entry.wasm = hash
    byShape.set(shape, entry)
  }

  const shapes = {}
  for (const [shape, entry] of [...byShape].sort()) {
    // Skip non-circuit entries (a stray shape key with none of the three runtime files).
    if (!entry.zkey && !entry.wasm && !entry.vkey) continue
    if (!entry.zkey || !entry.wasm || !entry.vkey) {
      throw new Error(`Shape ${shape} is missing one of zkey/wasm/vkey in SHA256SUMS — incomplete release?`)
    }
    shapes[paddedShape(shape)] = { zkey: entry.zkey, wasm: entry.wasm, vkey: entry.vkey }
  }
  if (Object.keys(shapes).length === 0) throw new Error('No circuit shapes found in SHA256SUMS')
  return shapes
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const sums = args.sums ? readFileSync(args.sums, 'utf8') : downloadSums(args.tag)
  const manifest = { release: args.tag, shapes: buildShapes(sums) }
  writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`)
  const count = Object.keys(manifest.shapes).length
  console.log(`Wrote ${args.out} — release ${args.tag}, ${count} shapes.`)
}

main()
