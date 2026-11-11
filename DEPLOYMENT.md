# Deploying armada-interface (Vercel / Netlify)

> **Local vs deployed invariants (relayer, fees, env):** [`LOCAL_VS_DEPLOY.md`](./LOCAL_VS_DEPLOY.md) — read before changing `network.ts`, fee hooks, or hosting config.

## How each host builds

- **Netlify:** the production bundle runs out of memory in Netlify's build container, so `.github/workflows/deploy.yml` builds it on a GitHub runner on every push to `main` and pushes the prebuilt `dist/` with `netlify-cli deploy --no-build --prod`. Netlify's own continuous deployment must stay disabled. The workflow's env comes from **GitHub repo variables / secrets** (listed at the top of `deploy.yml`), not the Netlify UI; `netlify.toml`'s `[build]` block isn't run, but its redirects + headers are applied.
- **Vercel:** its git integration builds at the repo root from `vercel.json` (`build.env` sets `VITE_NETWORK`); other vars go in the Vercel project settings.

## Required environment variables

| Variable | Value | Purpose |
|----------|------------------|---------|
| `VITE_NETWORK` | `sepolia` | Use Sepolia manifests and RPCs (set in `vercel.json` for Vercel; in `deploy.yml`'s env for Netlify). Also picks the domain in the link-preview card's image URL (`src/config/socialPreview.ts`: sepolia → `https://app.testnet.armada.blue`, mainnet → `https://app.armada.blue`) — a build served elsewhere shows the card only once that domain serves `/og-image.png`. |
| `VITE_ARTIFACTS_BASE_URL` | **Public HTTPS URL** (required for hosted builds) | Host serving the ZK circuits (`<base>/NNxMM/{zkey,circuit.wasm,vkey.json}`), integrity-checked against `src/config/circuits.manifest.json` (see `docs/CIRCUIT_ARTIFACTS.md`). `deploy.yml` and CI default it to `https://circuits.knowable.run/v0.1.0-dev`. Unset → same-origin `/artifacts`, and the `prebuild` check fails unless `public/artifacts` was filled with `npm run circuits:fetch`. |
| `VITE_RELAYER_URL` | **Public HTTPS URL** (optional) | Fee quotes (`/fees`) and relayed submission (`/relay`). Every spend (send, unshield, yield, merge) is relayed, so **unset → spends are blocked**; only shield works, submitted directly from the user's wallet. Never use `localhost:3001` on hosted previews. |
| `VITE_INDEXER_URL` | **Public HTTPS URL** (optional) | Relayer-v2 watcher base URL for shielded quick-sync (`GET /v2/quick-sync/:hubChainId`, called by `@armada/sdk`). Set → the SDK hydrates its merkletree from the watcher instead of an O(chain-length) `eth_getLogs` scan. **Unset → the SDK falls back to the slow on-chain scan; the app is fully functional either way.** Safe to cache/CDN. On-chain merkleroot validation + the nullifier cross-check keep a malicious watcher from forging or inflating balances (see `SECURITY.md`). HTTPS mandatory on hosted builds (mixed-content). |
| `VITE_WALLETCONNECT_PROJECT_ID` | Project ID | WalletConnect modal (optional for MetaMask-only testing). |
| `DEPLOYMENT_REF` | Optional, commit SHA (build-step, non-VITE) | Which `ship-armada/armada-deployments` commit the manifests are fetched from. **Defaults to the mutable `main` branch when unset.** These manifests carry fund-receiving contract addresses, so **pin to a specific SHA for production** to freeze them into the build (and bump deliberately per release); leaving it on `main` is convenient but means a repo change flows into the next build. |
| `DEPLOYMENT_INSTANCE` | Optional, defaults `demo3` (build-step, non-VITE) | Which instance directory under `testnet/` to fetch. The fetch reads that instance's `manifest.json` index and pulls every chain it lists (no hardcoded chain set). |
| `VITE_SENTRY_DSN` | Optional | Sentry DSN. **Unset → Sentry init is a no-op** (local/dev + any build without it transmit nothing). Errors only (no perf/replay), `sendDefaultPii: false`, and a `beforeSend` scrubber redacts 0zk/EVM addresses + long hex. |
| `VITE_SENTRY_ENVIRONMENT` | Optional, falls back to Vite `MODE` | Environment tag on Sentry events (e.g. `production`, `sepolia`). |
| `VITE_SENTRY_RELEASE` | Optional | Release tag on events. The deploy workflow sets it to the build commit (`github.sha`) so the runtime tag (`Sentry.init`) and the uploaded source maps (vite plugin) share one release name — required for stack traces to symbolicate. Unset → the plugin falls back to git auto-detection (less deterministic). |
| `SENTRY_AUTH_TOKEN` | Optional, **secret** (build-step, non-VITE) | Enables source-map **upload**. Unset → the Vite plugin self-disables AND no sourcemaps are emitted at all (so an un-configured build never publishes maps). Set it (+ `SENTRY_ORG`/`SENTRY_PROJECT`) to upload `hidden` maps that are deleted from `dist/` after upload. **Never commit.** |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Optional (build-step, non-VITE) | Sentry org + project slugs the maps upload to. Required alongside `SENTRY_AUTH_TOKEN`. |

Less common overrides: `VITE_SEPOLIA_RPC_FALLBACK` (a second hub RPC → viem `fallback` transport), `VITE_IRIS_URL` (Circle Iris API; defaults to the sandbox), `VITE_INTEGRATOR_ADDRESS` (shield-fee integrator; defaults to the zero address) and `VITE_PUBLIC_APP_ORIGIN` (origin used in shared pay-via-link URLs, for testing).

Hosted Sepolia builds without `VITE_RELAYER_URL` can only shield (direct from the user's wallet); sends, unshields, yield and merges need the relayer, and cross-chain delivery also relies on your team's relayer process running on infrastructure.

When `VITE_RELAYER_URL` is unset on a Sepolia build, the app resolves the relayer URL to `''` (never `localhost:3001`): `isRelayerConfigured()` is false, so fee quotes don't fetch, gasless toggles disable, and the modals show a **"No relayer configured"** banner — shield proceeds from the wallet, spends can't be submitted. Set `VITE_RELAYER_URL` to the public **HTTPS** relayer origin and redeploy to enable relayer-mediated flows. (An `http://` relayer from an `https://` page is blocked as mixed content — HTTPS is mandatory.)

## Error monitoring (Sentry)

Sentry is wired in `src/lib/sentry.ts` (init) + funnelled through `lib/telemetry.ts`'s `trackError`
(so the root `AppErrorBoundary`, the global `unhandledrejection` handler, and every `trackError`
call report). It's **fully DSN-gated**: with `VITE_SENTRY_DSN` unset it's a no-op and transmits
nothing — so local/dev and any un-configured build are unaffected.

To enable on a deploy: set `VITE_SENTRY_DSN` (runtime capture) and, for source maps,
`SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (build-step secrets). Source maps are emitted
`hidden`, uploaded, then deleted from `dist/` — and **not emitted at all** when the auth token is
absent, so maps are never published. The Sentry ingest host (`https://*.sentry.io`) is already in
the CSP `connect-src` of both `netlify.toml` and `vercel.json`. Privacy: errors-only,
`sendDefaultPii: false`, and a `beforeSend` scrubber redacts 0zk/EVM addresses + long hex from the
message, stack, breadcrumbs, and request URL before transmission.

## Pre-demo checklist (human actions)

- [ ] **`DEPLOYMENT_REF`** (recommended for production) pinned to a specific `ship-armada/armada-deployments` commit SHA (a GitHub repo variable for the Netlify workflow; a Vercel project env var) — otherwise the build floats on `main` (P1-23).
- [ ] **Sentry** (optional): set `VITE_SENTRY_DSN` to enable error capture; add `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` to upload source maps. All inert until set.
- [ ] **`VITE_RELAYER_URL`** set to the relayer's **HTTPS** origin and the VPS relayer confirmed reachable over HTTPS, for any spend (send / unshield / yield / merge) and gasless shield. Unset → shield-only from the wallet, spends blocked, and a "no relayer configured" banner (P0-10).
- [ ] **WalletConnect** (P2): set a real `VITE_WALLETCONNECT_PROJECT_ID` and enable the **domain allowlist (Verify API)** for the deploy origin in WalletConnect Cloud, so the project ID can't be used from other origins.
- [ ] **CSP** promoted from `Content-Security-Policy-Report-Only` to enforcing only after a click-through with devtools open on a Netlify draft deploy (headers only apply on Netlify; publish one by hand with `npx netlify-cli deploy --no-build --dir=dist` after `npm run build` — CI doesn't publish PR previews), and after adding the relayer (`VITE_RELAYER_URL`), indexer (`VITE_INDEXER_URL`) and circuits (`VITE_ARTIFACTS_BASE_URL`) origins plus the default-enabled OP Sepolia RPC (`https://sepolia.optimism.io`) to `connect-src` in both `netlify.toml` and `vercel.json` (P0-8).

## Running the relayer for Sepolia

In the **armada-poc** repo, on a VPS or your machine (with a tunnel if you need HTTPS for Vercel):

```bash
source config/sepolia.env
# config/secrets.env with DEPLOYER_PRIVATE_KEY
npm run relayer:sepolia
```

Expose port `3001` (or reverse-proxy to HTTPS) and set that origin as `VITE_RELAYER_URL`, then **redeploy** the frontend so Vite bakes the URL into the bundle.

## Local development

In **armada-poc** (see the README's Mode 1):

```bash
npm run chains          # Anvil (local mode only)
npm run setup           # local deploy
npm run armada-relayer  # http://localhost:3001
```

Then, in this repo, copy `.env.example` → `.env.development` with `VITE_NETWORK=local` and `VITE_RELAYER_URL=http://localhost:3001`.
