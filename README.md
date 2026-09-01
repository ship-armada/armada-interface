# Armada Interface

The user-facing web app for **Armada** — private USDC on-chain. Shield USDC into a private balance, send it privately, move it across chains, and earn shielded yield, all from one wallet.

Built with React 19 + TypeScript, Vite, wagmi / RainbowKit / viem, Jotai, TanStack Query, and the [`@armada/sdk`](https://github.com/ship-armada/armada-sdk). The design system is vendored under `src/design`, so the app is fully self-contained.

---

## Prerequisites

- **Node 20+** (22 works) and npm
- A browser wallet (MetaMask or any WalletConnect wallet)

```bash
git clone https://github.com/ship-armada/armada-interface.git
cd armada-interface
npm install
```

This app is a pure frontend. It runs in one of two modes:

- **Local** — against a devnet you stand up yourself (Anvil chains + contracts + relayer from the [`armada-poc`](https://github.com/ship-armada/armada-poc) repo).
- **Sepolia** — against a live testnet deployment published in [`armada-deployments`](https://github.com/ship-armada/armada-deployments).

The dev server runs on **http://localhost:5176**.

---

## Mode 1 — Local dev against Anvil

Local mode talks to three Anvil chains and the contracts/relayer that `armada-poc` deploys, and reads the ZK proving artifacts from `armada-circuits`.

### 1. Clone the repos side by side

The app auto-discovers its siblings, so the simplest layout is three checkouts in one parent directory:

```
armada/
├── armada-interface/   ← this repo
├── armada-poc/         ← contracts, deploy scripts, relayer, Anvil
└── armada-circuits/    ← ZK circuit build artifacts (build/)
```

```bash
# from the parent directory
git clone https://github.com/ship-armada/armada-poc.git
git clone https://github.com/ship-armada/armada-circuits.git   # or let armada-poc fetch it (below)
```

### 2. Stand up the devnet (in `armada-poc`)

```bash
cd armada-poc
npm install --legacy-peer-deps

./scripts/fetch-circuits.sh     # populate ../armada-circuits/build with the pinned ZK artifacts
npm run chains                  # 3 Anvil chains: hub :8545, clientA :8546, clientB :8547 (keep running)
npm run setup                   # compile + deploy all contracts (writes armada-poc/deployments/*.json)
npm run armada-relayer          # HTTP fee API + CCTP relay on :3001 (keep running)
```

`npm run chains` and `npm run armada-relayer` are long-running — leave them in their own terminals. Re-run `npm run setup` whenever you restart the chains (Anvil wipes state on restart, so the deployment manifests must be regenerated to match).

### 3. Start the interface (in `armada-interface`)

```bash
cd ../armada-interface
npm run dev
```

Open **http://localhost:5176**. With the sibling layout above, the dev server automatically finds `armada-poc/deployments/` and `armada-circuits/build/` — no configuration needed.

If your repos live elsewhere, point the app at them explicitly:

```bash
ARMADA_POC_DIR=/path/to/armada-poc \
ARMADA_CIRCUITS_DIR=/path/to/armada-circuits/build \
npm run dev
```

> Env vars are read when Vite starts. If you set them after the server is already running, restart it.

### Local env (optional)

Local defaults work out of the box. To customize, copy the example and edit:

```bash
cp .env.example .env.development
```

| Variable | Default (local) | Purpose |
|---|---|---|
| `VITE_NETWORK` | `local` | Selects the Anvil devnet |
| `VITE_RELAYER_URL` | `http://localhost:3001` | Fee-quote + relay API from `armada-relayer` |
| `VITE_DEV_MOCK_BALANCE` | `true` | Seeds a mock USDC balance for onboarding |

A brand-new wallet can fund itself from the in-app faucet (local mode only).

---

## Mode 2 — Local dev against a Sepolia deployment

Run the dev server against a live Sepolia deployment — no Anvil, no `armada-poc`, no `armada-circuits` needed. Deployments are published as named **instances** in [`armada-deployments`](https://github.com/ship-armada/armada-deployments/tree/main/testnet) (e.g. `demo3`, `demo2`, `medi1`…).

### 1. Fetch the instance's manifests

```bash
# from the armada-interface repo root (defaults to instance demo3)
DEPLOYMENT_INSTANCE=demo3 node scripts/fetch-sepolia-deployments.mjs
```

This downloads the instance's contract manifests into `public/api/deployments/`. Pin a specific commit with `DEPLOYMENT_REF=<sha>` (defaults to the `main` branch of `armada-deployments`).

### 2. Start the interface in Sepolia mode

```bash
ARMADA_DEPLOYMENTS_DIR="$PWD/public/api/deployments" \
VITE_NETWORK=sepolia \
npm run dev
```

Open **http://localhost:5176**. The app talks to public Sepolia RPCs and reads the manifests you just fetched. (`ARMADA_DEPLOYMENTS_DIR` points the dev server's manifest endpoint at the fetched copies.)

### Sepolia env (optional)

| Variable | Purpose |
|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | Enables the WalletConnect modal (recommended) |
| `VITE_SEPOLIA_RPC`, `VITE_BASE_SEPOLIA_RPC`, `VITE_ARB_SEPOLIA_RPC` | Override the default public RPCs |
| `VITE_RELAYER_URL` | A public HTTPS relayer origin, if one is running |
| `VITE_INDEXER_URL` | Watcher quick-sync endpoint — hydrates cold wallets fast instead of a full log scan |

### Production-faithful alternative

To serve the exact static bundle that deploys to production:

```bash
DEPLOYMENT_INSTANCE=demo3 node scripts/fetch-sepolia-deployments.mjs
VITE_NETWORK=sepolia npm run build
npm run preview        # serves the built dist/ on :4173
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with HMR (**:5176**) |
| `npm run build` | Type-check + production bundle to `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run test` | Unit tests (Vitest) |
| `npm run prepare:artifacts` | Verify the committed ZK artifacts are present |

---

## Deployment

The app deploys as a static site on **Netlify** and **Vercel** via their git integrations; both configs (`netlify.toml`, `vercel.json`) are committed and build at the repo root. Production builds run in Sepolia mode and fetch their manifests from `armada-deployments` at build time. See `DEPLOYMENT.md` for the full env-var table and relayer notes, and `LOCAL_VS_DEPLOY.md` for the local-vs-hosted invariants.

---

## Project structure

```
src/
├── config/       env-driven network, wagmi, deployments, relayer config
├── design/       vendored design system (@/design) — primitives + tokens
├── lib/          pure logic (no React): rpc, cache, format, telemetry, relayer, cctp
│   ├── shielded/ @armada/sdk wrappers (wallet, prover, sync, balances)
│   └── tx/       transaction lifecycle model (types, lifecycles, executor)
├── state/        Jotai atoms
├── hooks/        per-concern React hooks
├── components/   feature UIs (dashboard, shield, yield, payments, tx, settings)
└── pages/        Dashboard, Debug, PayViaLinkLanding
```

For architecture and per-module conventions, see `CLAUDE.md` and the per-folder `CLAUDE.md` files.
