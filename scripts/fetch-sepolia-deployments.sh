#!/usr/bin/env bash
# ABOUTME: Downloads Sepolia deployment manifests into public/api/deployments for production builds.
# ABOUTME: Mirrors apps/armada-interface/netlify.toml — run before vite build on Vercel/Netlify.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/public/api/deployments"
INSTANCE="${DEPLOYMENT_INSTANCE:-demo1}"
# Manifest ref (P1-23). These manifests carry fund-receiving contract addresses, so for production
# pin DEPLOYMENT_REF to a commit SHA of ship-armada/armada-deployments — that freezes the addresses
# into the build. Optional: defaults to the mutable `main` branch when unset (convenient, but a
# repo change then flows into the next build, which is the supply-chain risk pinning avoids).
REF="${DEPLOYMENT_REF:-main}"
if [ -z "${DEPLOYMENT_REF:-}" ]; then
  echo "WARNING: DEPLOYMENT_REF unset — fetching from mutable 'main'. Pin to a commit SHA for production."
fi
BASE="https://raw.githubusercontent.com/ship-armada/armada-deployments/${REF}/testnet/${INSTANCE}"

mkdir -p "${OUT}"
echo "Fetching deployment manifests (instance: ${INSTANCE}, ref: ${REF})…"

curl -sfL -o "${OUT}/hub-sepolia-v3.json" "${BASE}/sepolia/cctp.json"
curl -sfL -o "${OUT}/client1-sepolia-v3.json" "${BASE}/base-sepolia/cctp.json"
curl -sfL -o "${OUT}/client2-sepolia-v3.json" "${BASE}/arbitrum-sepolia/cctp.json"
# Client manifest names use armada-poc's 1-based deployment prefix (client1, client2, …) so the app's
# deployments.ts resolves them from each client's stable `deploymentPrefix`. base-sepolia == client1,
# arbitrum-sepolia == client2 (see config/network.ts sepoliaClientRegistry).
curl -sfL -o "${OUT}/privacy-pool-hub-sepolia.json" "${BASE}/sepolia/privacy-pool.json"
curl -sfL -o "${OUT}/privacy-pool-client1-sepolia.json" "${BASE}/base-sepolia/privacy-pool.json"
curl -sfL -o "${OUT}/privacy-pool-client2-sepolia.json" "${BASE}/arbitrum-sepolia/privacy-pool.json"
curl -sfL -o "${OUT}/yield-hub-sepolia.json" "${BASE}/sepolia/yield.json"
curl -sfL -o "${OUT}/fee-module-hub-sepolia.json" "${BASE}/sepolia/fee-module.json"

# optimism-sepolia == client3 (config/network.ts). Catalogued but off by default (enabledByDefault:
# false) and not yet published upstream, so these are best-effort: `|| true` keeps `set -e` from
# failing the build when the dir is absent. They start succeeding once armada-deployments adds
# optimism-sepolia/; the app only requests these files when client3 is enabled via VITE_ENABLED_CLIENTS.
curl -sfL -o "${OUT}/client3-sepolia-v3.json" "${BASE}/optimism-sepolia/cctp.json" || true
curl -sfL -o "${OUT}/privacy-pool-client3-sepolia.json" "${BASE}/optimism-sepolia/privacy-pool.json" || true

echo "Done."
