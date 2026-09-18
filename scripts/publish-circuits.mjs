// ABOUTME: Normalizes an armada-circuits release into the interface's per-shape layout
// ABOUTME: (NNxMM/{zkey,circuit.wasm,vkey.json}), integrity-verifies it, and deploys it (local dir or rsync).

// Usage:
//   node scripts/publish-circuits.mjs --tag <release> --dest <dir | user@host:/path> [--from <dir>]
//                                     [--sums <path>] [--no-manifest] [--keep-tmp]
//
// Examples:
//   # Populate local public/artifacts for same-origin dev (regenerates the manifest):
//   node scripts/publish-circuits.mjs --tag v0.1.0-dev --dest public/artifacts
//   # Deploy to the VPS host (nginx serves it with CORS + immutable cache headers):
//   node scripts/publish-circuits.mjs --tag v0.1.0-dev --dest deploy@vps:/var/www/circuits/v0.1.0-dev
//
// The release ships one .tgz of `NxM/final.zkey`, `NxM/main_NxM_js/main_NxM.wasm`, `NxM/vkey.json`
// (+ r1cs/witness helpers we drop) and a `SHA256SUMS`. We verify every served file against it, so a
// corrupt download can never reach a deploy. `--from <dir>` uses an already-extracted tree (skips gh).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CIRCUITS_REPO = 'ship-armada/armada-circuits'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { manifest: true, keepTmp: false }
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i]
    if (f === '--tag') args.tag = argv[++i]
    else if (f === '--dest') args.dest = argv[++i]
    else if (f === '--from') args.from = argv[++i]
    else if (f === '--sums') args.sums = argv[++i]
    else if (f === '--no-manifest') args.manifest = false
    else if (f === '--keep-tmp') args.keepTmp = true
    else throw new Error(`Unknown argument: ${f}`)
  }
  if (!args.dest) throw new Error('Missing required --dest <dir | user@host:/path>')
  // Default the tag to the pinned release in the committed manifest, so `--dest public/artifacts`
  // alone reproduces the deployed shape set. Pass --tag explicitly to move to a new release.
  if (!args.from && !args.tag) {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'src/config/circuits.manifest.json'), 'utf8'))
    args.tag = manifest.release
  }
  return args
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Download + extract a release tarball into a temp dir; return { extractedDir, sumsPath }. */
function downloadRelease(tag, tmp) {
  console.log(`Downloading ${tag} from ${CIRCUITS_REPO}…`)
  execFileSync('gh', ['release', 'download', tag, '-R', CIRCUITS_REPO, '-p', '*.tgz', '-p', 'SHA256SUMS', '-D', tmp], {
    stdio: 'inherit',
  })
  const tgz = readdirSync(tmp).find((f) => f.endsWith('.tgz'))
  if (!tgz) throw new Error(`No .tgz asset found in release ${tag}`)
  const extracted = join(tmp, 'extracted')
  mkdirSync(extracted, { recursive: true })
  console.log('Extracting…')
  execFileSync('tar', ['xzf', join(tmp, tgz), '-C', extracted], { stdio: 'inherit' })
  return { extractedDir: extracted, sumsPath: join(tmp, 'SHA256SUMS') }
}

/** Map SHA256SUMS → { shape → { zkey, wasm, vkey } } of expected hashes (padded NNxMM shape keys). */
function parseSums(sumsText) {
  const byShape = new Map()
  for (const line of sumsText.split('\n')) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\.\/(.+)$/)
    if (!m) continue
    const [, hash, path] = m
    const [shape, ...rest] = path.split('/')
    const file = rest.join('/')
    const [n, mm] = shape.split('x')
    const padded = `${n.padStart(2, '0')}x${mm.padStart(2, '0')}`
    const entry = byShape.get(shape) ?? { padded, files: {} }
    if (file === 'final.zkey') entry.files.zkey = { src: `${shape}/final.zkey`, hash }
    else if (file === 'vkey.json') entry.files.vkey = { src: `${shape}/vkey.json`, hash }
    else if (file === `main_${shape}_js/main_${shape}.wasm`)
      entry.files.wasm = { src: `${shape}/main_${shape}_js/main_${shape}.wasm`, hash }
    byShape.set(shape, entry)
  }
  return byShape
}

const OUT_NAME = { zkey: 'zkey', wasm: 'circuit.wasm', vkey: 'vkey.json' }

/** Copy the 3 runtime files per shape into staging/NNxMM/, verifying each against SHA256SUMS. */
function normalize(extractedDir, byShape, staging) {
  let shapes = 0
  for (const [shape, entry] of byShape) {
    const files = entry.files
    if (!files.zkey || !files.wasm || !files.vkey) {
      // A shape key with none of the three isn't a circuit; a partial one is a broken release.
      if (files.zkey || files.wasm || files.vkey) throw new Error(`Shape ${shape} incomplete in release`)
      continue
    }
    const outDir = join(staging, entry.padded)
    mkdirSync(outDir, { recursive: true })
    for (const key of ['zkey', 'wasm', 'vkey']) {
      const { src, hash } = files[key]
      const srcPath = join(extractedDir, src)
      const actual = sha256File(srcPath)
      if (actual !== hash) throw new Error(`Integrity check failed for ${src}: expected ${hash}, got ${actual}`)
      cpSync(srcPath, join(outDir, OUT_NAME[key]))
    }
    shapes += 1
  }
  if (shapes === 0) throw new Error('No complete circuit shapes found')
  return shapes
}

function deploy(staging, dest) {
  if (dest.includes(':')) {
    console.log(`rsync → ${dest}`)
    execFileSync('rsync', ['-av', '--delete', `${staging}/`, `${dest}/`], { stdio: 'inherit' })
  } else {
    const abs = isAbsolute(dest) ? dest : join(REPO_ROOT, dest)
    console.log(`Copying → ${abs}`)
    rmSync(abs, { recursive: true, force: true })
    mkdirSync(abs, { recursive: true })
    cpSync(staging, abs, { recursive: true })
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const tmp = mkdtempSync(join(tmpdir(), 'armada-circuits-'))
  try {
    let extractedDir = args.from
    let sumsPath = args.sums
    if (!extractedDir) {
      const dl = downloadRelease(args.tag, tmp)
      extractedDir = dl.extractedDir
      sumsPath = sumsPath ?? dl.sumsPath
    }
    if (!sumsPath || !existsSync(sumsPath)) throw new Error('SHA256SUMS not found — pass --sums <path>')

    const byShape = parseSums(readFileSync(sumsPath, 'utf8'))
    const staging = join(tmp, 'staging')
    mkdirSync(staging, { recursive: true })
    const shapes = normalize(extractedDir, byShape, staging)
    console.log(`Normalized + verified ${shapes} shapes.`)

    if (args.manifest && args.tag) {
      execFileSync('node', [join(REPO_ROOT, 'scripts/gen-circuits-manifest.mjs'), '--tag', args.tag, '--sums', sumsPath], {
        stdio: 'inherit',
      })
    }
    deploy(staging, args.dest)
    console.log('Done.')
  } finally {
    if (!args.keepTmp) rmSync(tmp, { recursive: true, force: true })
  }
}

main()
