// ABOUTME: Fetches Armada testnet deployment manifests from ship-armada/armada-deployments into
// ABOUTME: public/api/deployments, driven by the instance manifest.json index (no hardcoded chain list).

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'api', 'deployments')

const INSTANCE = process.env.DEPLOYMENT_INSTANCE || 'demo3'
// Manifest ref (P1-23). These manifests carry fund-receiving contract addresses, so for production
// pin DEPLOYMENT_REF to a commit SHA of ship-armada/armada-deployments — that freezes the addresses
// into the build. Optional: defaults to the mutable `main` branch when unset.
const REF = process.env.DEPLOYMENT_REF || 'main'
if (!process.env.DEPLOYMENT_REF) {
  console.warn("WARNING: DEPLOYMENT_REF unset — fetching from mutable 'main'. Pin to a commit SHA for production.")
}
const BASE = `https://raw.githubusercontent.com/ship-armada/armada-deployments/${REF}/testnet/${INSTANCE}`

// The app requests sepolia-mode manifest names (VITE_NETWORK=sepolia on every testnet build), so the
// on-disk suffix is always `-sepolia` regardless of which specific testnet instance we pull.
const SUFFIX = '-sepolia'

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  return await res.text() // write the manifest verbatim (don't reserialize)
}

async function pull(dir, artifacts, basename, outName, { required }) {
  if (!artifacts.includes(`${dir}/${basename}`)) {
    if (required) throw new Error(`${dir} is missing required artifact ${basename}`)
    return
  }
  const text = await fetchText(`${BASE}/${dir}/${basename}`)
  if (!text) {
    if (required) throw new Error(`Failed to fetch ${dir}/${basename} from ${BASE}`)
    return
  }
  await writeFile(join(OUT, outName), text)
  console.log(`  ✓ ${outName}`)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  console.log(`Fetching deployment manifests (instance: ${INSTANCE}, ref: ${REF})…`)

  // The instance index maps chain dir → { chainId, role, artifacts }. Driving off it (rather than a
  // hardcoded chain list) means the fetch adapts to each instance's client set — some have Base +
  // Arbitrum, others Base + Optimism, etc. The app binds each manifest by its embedded chainId, so
  // the client<i> numbering below is just a contiguous handle, not a chain identity.
  const indexText = await fetchText(`${BASE}/manifest.json`)
  if (!indexText) {
    throw new Error(`Could not fetch manifest.json for instance "${INSTANCE}" (ref ${REF}) at ${BASE}/manifest.json`)
  }
  const chains = Object.entries(JSON.parse(indexText).chains ?? {})
  const hub = chains.find(([, c]) => c.role === 'hub')
  const clients = chains.filter(([, c]) => c.role === 'client')
  if (!hub) throw new Error(`manifest.json for "${INSTANCE}" has no hub chain`)

  const [hubDir, hubCfg] = hub
  await pull(hubDir, hubCfg.artifacts, 'privacy-pool.json', `privacy-pool-hub${SUFFIX}.json`, { required: true })
  await pull(hubDir, hubCfg.artifacts, 'cctp.json', `hub${SUFFIX}-v3.json`, { required: true })
  await pull(hubDir, hubCfg.artifacts, 'yield.json', `yield-hub${SUFFIX}.json`, { required: false })
  await pull(hubDir, hubCfg.artifacts, 'fee-module.json', `fee-module-hub${SUFFIX}.json`, { required: false })

  // Write clients as a contiguous client1..N sequence so the app's probe finds them all. The order is
  // the index's order; it doesn't affect correctness (binding is by embedded chainId).
  let i = 0
  for (const [dir, cfg] of clients) {
    if (!cfg.artifacts.includes(`${dir}/privacy-pool.json`)) {
      console.warn(`  ⚠ ${dir} lists no privacy-pool.json — skipping`)
      continue
    }
    i += 1
    await pull(dir, cfg.artifacts, 'privacy-pool.json', `privacy-pool-client${i}${SUFFIX}.json`, { required: true })
    await pull(dir, cfg.artifacts, 'cctp.json', `client${i}${SUFFIX}-v3.json`, { required: false })
  }

  console.log(`Done. Hub + ${i} client(s) from instance "${INSTANCE}".`)
}

main().catch((err) => {
  console.error(`fetch-deployments failed: ${err.message}`)
  process.exit(1)
})
