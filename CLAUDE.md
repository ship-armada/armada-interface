# @armada/interface

USDC user app on the Armada protocol — shield, unshield, yield, payments, cross-chain. Replaces the legacy `usdc-v2-frontend` app.

**Account model (V2 shielded wallet, Path C):** The app always renders: while locked, the dashboard's balance spot holds the sign-in card, which signs in inline (`hooks/useSignIn`), and every action signs in first, then continues into it. That one state-agnostic sign-in is the account entry for first visit AND returning users — `signIn()` first-derives or re-derives the same identity, so there is no create/unlock split. Backup-file + paste-secret recovery (for smart-account wallets / cross-device) sit behind a "Restore wallet from backup instead" link that opens the `RestoreModal`; a non-deterministic signer gets the compatibility screen in that modal. Until the first SDK balance loads, the balance spot shows the sync progress (the Armada tick ring + percent) with no flow buttons, and activity already shows. Per-(EVM address, account) walletId map in localStorage drives account-switch detection + auto-lock. Tx history is scoped to the active walletId and AES-256-GCM-encrypted at rest under a per-wallet key. See `specs/TX_SIGNING.md` + `specs/TX_SIGNING_V2_AMENDMENT.md`. Tx flows (shield/unshield/payments/yield) are wired end-to-end.

**Chain history recovery (V1 Phase 9):** on unlock, `useHistoryRecovery` reconstructs history from the `@armada/sdk` wallet scan (`runHistoryScan` → `historyEntryToTxRecord`) and synthesizes terminal `TxRecord`s for shields / transacts / unshields / yield ops not already in local IDB. `useIncomingTransferDetector` re-fires the scan on every SDK balance event so received transfers (which the user didn't author) surface live. A per-wallet localStorage checkpoint makes subsequent scans incremental. Settings → "Re-scan history" / "Clear local history" let the user force a refresh or wipe locally. See `lib/shielded/history.ts`, `hooks/useHistoryRecovery.ts`, and `test/integration/history-recovery.test.tsx`.

## Architecture

Architectural decisions and rationale: `docs/ARCHITECTURE.md`. **Read first.** It covers the tx lifecycle model and execution engine, fees, the key and security boundary, the polling matrix, and the decision log.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Build | Vite 7 | `vite.config.ts` includes the `serveDeployments()` plugin for hub + client manifests |
| Framework | React 19 + TypeScript strict + `noUncheckedIndexedAccess` | Stricter than committer |
| Wallet | wagmi + RainbowKit + viem + ethers v6 | Same as crowdfund-committer; `walletClientToSigner` bridges to ethers |
| State | Jotai | Atoms in `src/state/`, derived inline in hooks |
| Server state | `@tanstack/react-query` | All HTTP, all RPC reads, all polling that fits the request/response shape |
| Styling | Vendored design system in `src/design` (CSS Modules + tokens, imported as `@/design`) + Tailwind v4 (layout glue) | Severed from the shared `@armada/ui` so the app is self-contained. No typography Tailwind classes in app code — body baseline (15px Geist 1.5) drives everything |
| Persistence | IndexedDB (`lib/cache.ts`) | Two stores: tx history (`txHistory`) and created payment-request links (`requestLinks`) |
| Routing | `react-router-dom` 7 | Routed pages: Dashboard (`/`), Debug (`/debug`), parked AddressBook, and the standalone `PayViaLinkLanding` (`/pay-via-link`, outside the App shell). Settings is a modal, not a page; `/history` was retired |
| QR | `qrcode.react` | Renders the pay-via-link QR (`components/payViaLink/PaymentLinkQrCode`) |

## Folder map

```
src/
├── main.tsx                 provider tree (StrictMode → AppErrorBoundary → Wagmi → Query → RainbowKit → Router; no Jotai Provider, so hooks share the executor's default store)
├── App.tsx                  installs visibility listener + hydrates tx history; renders <AppLayout>
├── index.css                @import tailwindcss + ./design/styles tokens.css + global.css
├── design/                  vendored design system (@/design) — primitives + tokens/typography CSS; severed from @armada/ui
│   ├── tokens/              Token Studio JSON (armada-tokens.json) — edit semantic.typography here, then `npm run tokens:typography`
│   └── styles/              tokens.css (hand-maintained colors) + generated typography.css; also fonts.css, mobileLayout.css
├── config/                  env-driven config — network, wagmi, deployments, relayer
├── lib/                     pure logic, no React (rpc, cache, format, revert, wagmi-adapter, telemetry, relayer, cctp)
│   ├── shielded/            @armada/sdk wrappers (wallet, keyManager, sdk-read, sdk-prover, sync, balance-bus, network, artifacts) — stock engine fully removed
│   └── tx/                  lifecycle model — types, lifecycles, reducer, storage, poller
├── state/                   Jotai atoms (tx, wallet, fees, visibility, ui)
├── hooks/                   per-concern hooks (useWallet, useShieldedWallet, useBalances, useYieldRate, useFees, useTx, useTxHistory, useTabVisible)
├── components/              AppLayout, WalletConnector, plus subfolders for each feature (dashboard/, shield/, yield/, payments/, consolidate/, tx/, settings/) — payments/ is the shared Send/Withdraw flow
└── pages/                   Dashboard, Debug, AddressBook, PayViaLinkLanding (Settings is a modal)
```

## Conventions (enforced)

- **All source files start with two-line `// ABOUTME:` comments.** Project-wide rule from the root CLAUDE.md.
- **No `ethers` or `@railgun-community/*` imports in `components/**`.** Business logic lives in `hooks/` and `lib/`. Components are dumb.
- **Import `@armada/sdk` from its root, not `/core` or `/wallet`, in production code — and at runtime only through `lib/shielded/sdk-loader.ts::loadSdk()`.** The root has everything app code needs (including `decodeAddress`); tests may use `/core` for engine-level types. Elsewhere use `import type` only: the SDK is ~8 MB with its inlined WASM, and a runtime import anywhere pulls it into the entry chunk the first screen waits on (13C); through `loadSdk()` it's a separate chunk, prefetched once the app shell is up (`hooks/usePrefetchSdk`). `src/test/sdk-imports.test.ts` enforces both, CI's `scripts/check-sdk-bundle.mjs` fails a production build that bundles the SDK engine more than once, and `scripts/check-entry-size.mjs` fails one whose entry chunk is over its budget (and writes a chunk report to the job summary). SDK errors are recognised by `code` (`lib/tx/errors.ts::SDK_ERROR_CODES`), not by class.
- **No `console.log`/`console.debug` in `lib/shielded/`.** Secret-leak prevention. Use `lib/telemetry.ts` instead. Telemetry is **typed** via an event registry (`lib/telemetry.ts::EventRegistry`); arbitrary props are not allowed.
- **No typography Tailwind classes app-wide.** `text-xs`/`font-*`/`tracking-*`/`leading-*`/`uppercase` etc. are forbidden — typography flows from the body baseline + `@/design` CSS Modules. Layout utilities (`flex`, `grid`, `mx-auto`, `pt-20`, color tokens) are fine.
- **TS strict + `noUncheckedIndexedAccess`.** No `any`, no `as any`. If a type is opaque (e.g. wagmi internals), narrow at the boundary.
- **Tx executor lives at module scope, not React scope.** `lib/tx/executor.ts` initialises via `startEngine()` (called once from `App.tsx`). Hooks dispatch `executeTx(id)` / `cancelTx(id)`; they don't orchestrate.
- **Single-leader execution.** Only the tab holding the `armada-tx-executor` `navigator.locks` lock runs handlers. Other tabs are passive observers. v1 has no follower-side live sync — opening multiple tabs means only the first is active. In practice a second tab **can't run at all**: the `@armada/sdk` read instance enforces one scan DB per origin (a second `IndexedDBStorageAdapter` throws `StorageConflictError`), so a second tab is caught and shown the full-screen `SingleTabGate` ("already open in another tab") instead of a broken shell (`anotherTabActiveAtom`). The executor raises it at boot when the lock is held elsewhere (`lib/tx/executor.ts`), before any signature; `sdk-read.ts::ensureInstance` raises it on `StorageConflictError` as a backstop.
- **Polling goes through React Query.** All HTTP and RPC reads that fit a request/response shape use `useQuery` / `useQueries`, configured with `refetchIntervalInBackground: false` so hidden tabs don't burn quota. Don't write bespoke `setInterval` pollers.
- **`eth_getLogs` is always bounded.** Never query from genesis or with an unbounded `toBlock` on a public RPC. Pool events are the SDK's job (its `sync/ranged-fetch.ts` windows each range and bisects one a provider rejects). App-side polling scans one window of at most `NetworkConfig.maxLogRange` blocks per tick and saves a cursor (`features/unshield-xchain/scan.ts`, used by both cross-chain handlers); `lib/rpc-bisecting.ts` (installed in `main.tsx`) splits any range an RPC still rejects. The per-network cap lives in `NetworkConfig.maxLogRange` (5_000 on sepolia, 100_000 on local).
- Per-folder CLAUDE.md captures folder-specific conventions.

## Testing

What earns a test, and how to write one so it fails when it should (#136):

- **Test logic, money figures, flow behaviour, and safety / privacy copy.** No new tests for a pure wording or styling change.
- **Wording has one owner** (`lib/tx/errorCopy`, `components/tx/noticeCopy`, `lib/payViaLink`, `ui/AddressText`, `dashboard/vaultEarnings`). Component tests check the wiring with a role query or a regex, not the literal string.
- **One test per input class.** Add an assertion to the sibling test rather than copying its setup; fold a lone `it` into the neighbouring `it.each`.
- **A click test already proves the button renders**, so skip "renders X" tests. At most one "wires its CTAs" test per component, and none when a modal-level test clicks the same control.
- **Money figures live in the `*.figures` / spec-ID tests** (`specs/TX_VALUES.md`); don't repeat them in general receipt or modal tests. Flow-parity tests across sibling flows stay.
- **Assert properties, not tuned config** (e.g. `usualMs < slowMs`, not the numbers). Identity derivations are the exception: `lib/crypto/kdf` pins known-answer vectors, because a changed label must fail.
- **Test a function where it's defined**, not through a re-export; name test-only exports `__…ForTests` or `_…`.
- **Prove the thing under test.** Don't mock it (stub the layer beneath it), don't assert CSS-module class names unless the class carries meaning, and compare two `invocationCallOrder` values for an ordering. A new guard is worth one temporary break to see it fail.
- **Delete a component's tests in the same change that retires it.**

## Dev commands

This is a standalone repo (no workspaces). From the repo root:

```bash
npm install                           # if dependencies changed
npm run dev                           # → http://localhost:5176
npm run typecheck                     # app + node configs, then the test files
npm run test                          # vitest
```

The README's "Mode 1" / "Mode 2" sections have the full setup for each network:

- **Local** (`VITE_NETWORK=local` — default): three Anvil chains on `:8545` / `:8546` / `:8547`. `npm run chains`, `npm run setup` and `npm run armada-relayer` run in the sibling **armada-poc** checkout, not here; the dev server reads that checkout's `deployments/` (override with `ARMADA_POC_DIR` / `ARMADA_DEPLOYMENTS_DIR`).
- **Sepolia** (`VITE_NETWORK=sepolia`): fetch an instance's manifests with `node scripts/fetch-sepolia-deployments.mjs` (writes `public/api/deployments/`: `privacy-pool-hub-sepolia.json`, `hub-sepolia-v3.json`, `privacy-pool-client<i>-sepolia.json`, …) and point the dev server at them with `ARMADA_DEPLOYMENTS_DIR="$PWD/public/api/deployments"`.
- **ZK circuits** (both modes): set `VITE_ARTIFACTS_BASE_URL` to a hosted release, or run `npm run circuits:fetch` to fill `public/artifacts` (see `docs/CIRCUIT_ARTIFACTS.md`).

## Duplicated utilities

`src/lib/rpc.ts`, `format.ts`, `multicall3.ts` (from `@armada/crowdfund-shared`) and `wagmi-adapter.ts`, `revert.ts` (from the crowdfund committer) are duplicates of crowdfund-app files. They live here so this app doesn't depend on a crowdfund-named package. When both apps need to evolve these, extract them to a new `@armada/eth-utils` package (`docs/ARCHITECTURE.md` §16). Don't pre-extract.

## Tx lifecycle model — required reading

The central design is in `src/lib/tx/types.ts`, `src/lib/tx/lifecycles.ts`, and `src/lib/tx/executor.ts`. Every transaction kind (`shield`, `shield-xchain`, `unshield-local`, `unshield-xchain`, `transfer-shielded`, `transfer-shielded-received`, `yield-deposit`, `yield-withdraw`, `consolidate`) declares its own stage sequence with a per-kind `maxDurationMs` + `retry` policy. Records carry an `executionState` (lifecycle position: `pending | active | waiting | retrying | completed | failed | expired | cancelled`) separate from the protocol `stage`. The same `useTx()` hook handles all kinds; the same in-flight processing view (`components/tx/processing/`, rendered by `components/flow/ProgressStep`) renders any record. Adding a new kind touches:

1. The `TxKind` union, stage union, and meta in `lib/tx/types.ts`.
2. A lifecycle entry in `lib/tx/lifecycles.ts`.
3. A `StageHandler` registered from a `features/<area>/index.ts` module, imported for its side effect in `src/App.tsx` (alongside the other `@/features/*` imports), with a `handler.idempotency.test.ts` beside the handler (as in `features/shield/` and `features/unshield/`).
4. The kind's copy in `components/tx/stageCopy.ts`, `components/tx/processing/processingView.ts` and `components/tx/noticeCopy.ts`. The first two are `Record<TxKind, …>` maps; `noticeCopy`'s is `Record<Exclude<TxKind, 'unshield-local' | 'unshield-xchain'>, …>` (the unshield kinds get their copy separately). In all three the compiler flags a missing entry for a new kind.

The full checklist is in `src/lib/tx/CLAUDE.md`.

This model fixes the crowdfund-committer's `useTransactionFlow` single-tx limitation — multi-instance, persistent, cross-chain-aware.

**Displayed figures:** what each kind's amount / fee / total rows mean on Review, Confirm, the Activity row and receipt, and a receipt recovered from chain history — and which of them must agree — is specified in `specs/TX_VALUES.md`. A change to how a figure is computed or shown updates its row there in the same PR (applied to every sibling flow).

## What's intentionally NOT in the scaffold

- Tx flows (shield/shield-xchain/unshield-local/unshield-xchain/transfer/yield) are wired end-to-end against real contracts + CCTP and run real ZK proofs; every spend (unshield, transfer, yield, merge) is submitted by the relayer (`lib/relayer.ts::submitRelay`), and shield uses either the user's wallet (direct) or a permit + relay (gasless). What's NOT done: finer-grained real-CCTP-mode Iris tracking. The xchain handlers collapse the last delivery stages on a single delivery detection (one write straight to delivered, marking the unobserved attestation / mint stages done): the relayer's CCTP delivery status (`lib/relayer.ts::fetchCctpDeliveryStatus`), falling back to a bounded `MessageReceived` scan on the destination chain.
- e2e tests.
- A remote telemetry sink beyond Sentry. Sentry error capture IS wired (`lib/sentry.ts`, DSN-gated via `VITE_SENTRY_DSN` — see DEPLOYMENT.md), but the structured `track()` info events remain console-only.
- Service worker / offline support.
- i18n.
- Mnemonic import flow. Keys are derived from an EIP-712 signature at sign-in, not from a generated mnemonic; recovery is the backup file / pasted recovery secret in `RestoreModal` (`docs/ARCHITECTURE.md` §9).
