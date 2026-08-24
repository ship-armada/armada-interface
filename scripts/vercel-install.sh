#!/usr/bin/env bash
# ABOUTME: Vercel install hook for armada-interface — clean install + Linux native binaries.
# ABOUTME: Referenced from vercel.json; runs at the repo root.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "[vercel-install] cleaning node_modules…"
rm -rf node_modules

echo "[vercel-install] npm ci — respects the committed lockfile…"
npm ci --include=optional

echo "[vercel-install] ensure linux native modules (rollup, lightningcss, oxide)…"
node scripts/ensure-linux-native-modules.mjs

echo "[vercel-install] done."
