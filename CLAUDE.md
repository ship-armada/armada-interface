# @armada/interface

USDC user app on the Armada protocol — shield, unshield, yield, payments, cross-chain. Replaces the legacy `usdc-v2-frontend` app.

**Status:** Scaffold only. No real wallet/contract/relayer/Railgun integration yet. Every flow stubs through `telemetry.track('stub.*')` so the shapes are real but the side effects are deferred.

## Plan

Architectural decisions and rationale: `../../.claude/PLAN_ARMADA_INTERFACE.md`. **Read first.** It defines the tx lifecycle model, polling matrix, security boundary, and 19 locked decisions.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Build | Vite 7 | `vite.config.ts` includes the `serveDeployments()` plugin for hub + client manifests |
| Framework | React 19 + TypeScript strict + `noUncheckedIndexedAccess` | Stricter than committer |
| Wallet | wagmi + RainbowKit + viem + ethers v6 | Same as crowdfund-committer; `walletClientToSigner` bridges to ethers |
| State | Jotai | Atoms in `src/state/`, derived inline in hooks |
| Server state | `@tanstack/react-query` | All HTTP, all RPC reads, all polling that fits the request/response shape |
| Styling | `@armada/ui` (CSS Modules + tokens) + Tailwind v4 (layout glue) | No typography Tailwind classes in app code — body baseline (15px Geist 1.5) drives everything |
| Persistence | IndexedDB (`lib/cache.ts`) | Stores tx history, fee quotes, ENS, shielded balance snapshots |
| Routing | `react-router-dom` 7 | Three pages today (Dashboard, History, Settings) plus a parked AddressBook |

## Folder map

```
src/
├── main.tsx                 provider tree (StrictMode → Wagmi → Query → RainbowKit → Jotai → Router → Motion)
├── App.tsx                  installs visibility listener + hydrates tx history; renders <AppLayout>
├── index.css                @import tailwindcss + @armada/ui tokens.css + global.css
├── config/                  env-driven config — network, wagmi, deployments, relayer
├── lib/                     pure logic, no React (rpc, cache, format, revert, wagmi-adapter, telemetry, relayer, cctp)
│   ├── railgun/             SDK wrappers (wallet, prover, sync) — currently stubbed
│   └── tx/                  lifecycle model — types, lifecycles, reducer, storage, poller
├── state/                   Jotai atoms (tx, wallet, fees, visibility, ui)
├── hooks/                   per-concern hooks (useWallet, useShieldedWallet, useBalances, useYieldRate, useFees, useTx, useTxHistory, useCctpAttestation, useTabVisible)
├── components/              AppLayout, WalletConnector, plus subfolders for each feature (balance/, shield/, unshield/, yield/, payments/, tx/, settings/)
└── pages/                   Dashboard, History, Settings, AddressBook
```

## Conventions (enforced)

- **All source files start with two-line `// ABOUTME:` comments.** Project-wide rule from the root CLAUDE.md.
- **No `ethers` or `@railgun-community/*` imports in `components/**`.** Business logic lives in `hooks/` and `lib/`. Components are dumb.
- **No `console.log`/`console.debug` in `lib/railgun/`.** Secret-leak prevention. Use `lib/telemetry.ts` instead.
- **No typography Tailwind classes app-wide.** `text-xs`/`font-*`/`tracking-*`/`leading-*`/`uppercase` etc. are forbidden — typography flows from the body baseline + @armada/ui CSS Modules. Layout utilities (`flex`, `grid`, `mx-auto`, `pt-20`, color tokens) are fine.
- **TS strict + `noUncheckedIndexedAccess`.** No `any`, no `as any`. If a type is opaque (e.g. wagmi internals), narrow at the boundary.
- Per-folder CLAUDE.md captures folder-specific conventions.

## Dev commands

```bash
# From repo root
npm install --legacy-peer-deps        # if dependencies changed
npm run armada:interface              # → http://localhost:5176

# Or equivalently:
npm run dev --workspace=@armada/interface

# Typecheck only
npm run typecheck --workspace=@armada/interface
```

For local mode (`VITE_NETWORK=local` — default), three Anvil chains must be running on `:8545` / `:8546` / `:8547`. Use the existing `npm run chains` + `npm run setup` from the repo root.

For Sepolia, set `VITE_NETWORK=sepolia` and ensure manifest files exist in `deployments/` (`privacy-pool-hub-sepolia.json`, `privacy-pool-client-sepolia.json`, `privacy-pool-clientB-sepolia.json`).

## Duplicated utilities

`src/lib/rpc.ts`, `format.ts`, `wagmi-adapter.ts`, `revert.ts` are duplicates of files in `@armada/crowdfund-shared`. They live here so this app doesn't depend on a crowdfund-named package. When both apps need to evolve these, extract them to a new `@armada/eth-utils` package (Plan §19). Don't pre-extract.

## Tx lifecycle model — required reading

The central design is in `src/lib/tx/types.ts` and `src/lib/tx/lifecycles.ts`. Every transaction kind (`shield`, `unshield-local`, `unshield-xchain`, `transfer-shielded`, `yield-deposit`, `yield-withdraw`, `payment-xchain`) declares its own stage sequence. The same `useTx()` hook handles all kinds; the same future `<TxLifecycleStepper>` component renders any record. Adding a new kind is a 3-file change:

1. Extend the `TxKind` union and add a stage union in `lib/tx/types.ts`.
2. Add a lifecycle entry in `lib/tx/lifecycles.ts`.
3. (Optional) Add custom rendering in `components/tx/`.

This model fixes the crowdfund-committer's `useTransactionFlow` single-tx limitation — multi-instance, persistent, cross-chain-aware.

## What's intentionally NOT in the scaffold

- Real wallet/contract/relayer/Railgun/CCTP integration. Every hook stubs out with `telemetry.track('stub.*')` calls.
- e2e tests.
- Real telemetry sink (console-only for now).
- Service worker / offline support.
- i18n.
- Mnemonic import flow (only generate-on-first-run, per Plan §15.7).
