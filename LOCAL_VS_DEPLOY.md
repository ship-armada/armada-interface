# Local vs deployed — armada-interface

**Read this before changing `network.ts`, `useFees`, `useRelayerHealth` / `useRelayerSubmitBlock`, `vercel.json`, `netlify.toml`, `deploy.yml`, or env examples.**

The app has two environments. They must stay split in code and in hosting env vars. Do not “simplify” by using one default for both.

## Quick reference

| Concern | Local (`VITE_NETWORK=local`) | Hosted Sepolia (Vercel / Netlify) |
|--------|------------------------------|-----------------------------------|
| **Network** | Anvil hub + client chains (`31337`…) | Sepolia + the enabled clients (default Base + Optimism Sepolia) |
| **Set in** | `.env.development` (from `.env.example`) | `vercel.json` `build.env` (Vercel) + `.github/workflows/deploy.yml` env (Netlify) → `VITE_NETWORK=sepolia` |
| **Relayer URL** | Defaults to `http://localhost:3001` | **Empty unless** `VITE_RELAYER_URL` is set to a **public HTTPS** origin |
| **Relayer HTTP** | `fetchFees` hits localhost (or override) | No localhost; with no `VITE_RELAYER_URL`, `isRelayerConfigured()` is false → no fee query, no health probe |
| **Without a relayer** | Spends blocked until it's reachable | Same: spends (send / unshield / yield / merge) are blocked; shield goes direct from the user's wallet |
| **Test USDC** | Debug-page faucet drip (`/api/fund-gas`) | Off — real Sepolia USDC |

## Code invariants (do not regress)

1. **`relayerUrl` in `src/config/network.ts`** (set inline in each mode's config)
   - Explicit `VITE_RELAYER_URL` → use it (`cleanEnv`: trimmed; empty counts as unset).
   - `local` mode, unset env → `http://localhost:3001`.
   - `sepolia` mode, unset env → **`''` (empty string), never localhost.**

2. **`isRelayerConfigured()`** — `relayerUrl.length > 0`. Hosted builds without env must stay “not configured”.

3. **`useFees` / `useRelayerHealth`** — queries **disabled** when the relayer isn't configured (no request to `localhost:3001`); `useFees` returns a `null` quote.

4. **`useRelayerSubmitBlock`** — spends have no wallet fallback (#23), so Confirm stays blocked while the relayer is unconfigured, unreachable or still being checked. `RelayerStatusBanner` explains it; shield (`walletFallback`) proceeds direct instead.

5. **Do not** add `?? 'http://localhost:3001'` to the sepolia config's relayer URL.

6. **Hosting files** — keep aligned:
   - `vercel.json` → `"VITE_NETWORK": "sepolia"`
   - `.github/workflows/deploy.yml` (the Netlify build) → `VITE_NETWORK: sepolia`; `netlify.toml`'s `[build.environment]` mirrors it for a local `netlify build`
   - Optional: `VITE_RELAYER_URL` only when a public relayer exists.

## Local setup

```bash
# in the sibling armada-poc checkout
npm run chains
npm run setup
npm run armada-relayer   # :3001
```

```bash
# in this repo
cp .env.example .env.development
# VITE_NETWORK=local
# VITE_RELAYER_URL=http://localhost:3001
npm run circuits:fetch   # or set VITE_ARTIFACTS_BASE_URL to a hosted circuits release
npm run dev              # :5176
```

The README's "Mode 1" section has the full walkthrough.

## Deploy checklist

- [ ] `VITE_NETWORK=sepolia` (committed in `vercel.json` and `.github/workflows/deploy.yml`).
- [ ] `VITE_ARTIFACTS_BASE_URL` points at the hosted circuits release (`deploy.yml` defaults it to the testnet host).
- [ ] Do **not** set `VITE_RELAYER_URL=http://localhost:3001` on hosted previews.
- [ ] Set `VITE_WALLETCONNECT_PROJECT_ID` for WalletConnect.
- [ ] Optional: `VITE_RELAYER_URL=https://…` when team relayer is on HTTPS.
- [ ] Redeploy after changing any `VITE_*` (baked in at build time).

## Tests

- `src/hooks/useRelayerSubmitBlock.test.tsx` — spends blocked when no relayer is configured, unreachable or still checking.
- `src/components/RelayerStatusBanner/RelayerStatusBanner.test.tsx` — the unconfigured / unreachable / checking banners.
- `src/hooks/useFees.test.tsx` — the fee-quote query.

No test pins the per-mode `relayerUrl` default itself. If you change relayer resolution, run:

```bash
npx vitest run useRelayerSubmitBlock RelayerStatusBanner useFees network
```

## Related docs

- `DEPLOYMENT.md` — Vercel/Netlify env table and relayer ops
- `src/config/CLAUDE.md` — config module map
