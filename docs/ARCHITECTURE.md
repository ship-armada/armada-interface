# armada-interface — architecture and decisions

The design of the app and the reasons behind it: the tx lifecycle model, the execution engine, fees, the key and
security boundary, polling, and the decision log. It began as the scaffolding plan (`PLAN_ARMADA_INTERFACE.md` in the
armada-poc repo, from before this app was split out) and is kept here, trimmed to what applies to this repo and
updated to match the code.

Folder-level detail lives in each folder's `CLAUDE.md` and is the more detailed source; this doc is the overview and
the "why". When they disagree, the code wins — fix whichever doc is wrong.

## 1. Goal

A React/Vite app for USDC users of the Armada protocol: shield / unshield, private sends and payments to external
wallets, the yield vault, payment-request links, and cross-chain moves via CCTP. Its central design problem is
tracking many transactions at once, across chains, through reloads — which is what the tx lifecycle model (§6–§7)
exists for.

## 2. Origins

- **The spine came from the crowdfund committer:** the provider tree, RPC fallback, React Query patterns, Jotai
  conventions, deployment-manifest loading and the `serveDeployments()` Vite dev plugin.
- **Built new for what the committer didn't need:** multi-tx tracking across chains, the cross-chain CCTP lifecycle,
  shielded keys and sync, relayer submission, and encrypted persistence.
- **Shielded reads, proving and spend planning come from `@armada/sdk`.** The stock `@railgun-community/*` engine the
  app first used has been removed.
- **The design system is vendored** in `src/design` (imported as `@/design`), severed from the shared `@armada/ui`, so
  the app is self-contained.
- **It is a standalone repo** (`ship-armada/armada-interface`). Local contract work still uses an armada-poc checkout
  for the Anvil chains, deploy scripts and relayer (see `README.md`, `LOCAL_VS_DEPLOY.md`).

## 3. Shared utility duplication — deliberate

`@armada/crowdfund-shared` mixes crowdfund-specific code with generic web utilities. Rather than extract the generics
into a new package up front, the small ones are **duplicated** from the crowdfund apps into `src/lib/`: `rpc.ts`,
`multicall3.ts` and `format.ts` from `crowdfund-shared`, `wagmi-adapter.ts` and `revert.ts` from the committer. Each
header names its source. See §16 for when to extract them.

## 4. Folder structure

The folder map is in the root `CLAUDE.md`; each folder's `CLAUDE.md` describes its contents. In short: `config/`
(env-driven network / wagmi / deployments), `lib/` (pure logic, no React — `lib/tx/` is the lifecycle model,
`lib/shielded/` wraps the SDK, `lib/crypto/` the key derivation), `features/` (one tx handler per authored kind — a received transfer is built from chain history), `state/`
(Jotai atoms), `hooks/`, `components/`, `pages/`, `design/`.

## 5. Provider tree

```tsx
<StrictMode>
  <AppErrorBoundary>              {/* outside the providers: a render error anywhere shows a recoverable card */}
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme(…)}>
          {/* no Jotai <Provider>: hooks and the module-scope executor share the default store */}
          <BrowserRouter>
            <Routes>…</Routes>
            <AppToaster />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </AppErrorBoundary>
</StrictMode>
```

Order matters: Query sits above RainbowKit and the routes so every hook can query; the toaster is a sibling of
`<Routes>` so it survives navigation. There is deliberately **no Jotai Provider** — the tx executor runs outside React
(§7) and writes through `getDefaultStore()`, so a Provider would give React an isolated store the executor never
touches. See `src/main.tsx`.

## 6. Transaction lifecycle — the central design

The committer's `useTransactionFlow` was single-tx and sequential. This app needs multi-tx, multi-chain,
lifecycle-aware tracking with persistence and resume. The types are in `src/lib/tx/types.ts`; the per-kind lifecycles
in `src/lib/tx/lifecycles.ts`; the full working detail in `src/lib/tx/CLAUDE.md`.

### Model

```ts
type TxKind =
  | 'shield'                      // EVM USDC → shielded USDC (hub)
  | 'shield-xchain'               // EVM USDC on a client chain → shielded USDC (via CCTP to the hub)
  | 'unshield-local'              // shielded USDC → EVM USDC (hub)
  | 'unshield-xchain'             // shielded USDC → EVM USDC on a client chain (via CCTP)
  | 'transfer-shielded'           // shielded → shielded (outgoing)
  | 'transfer-shielded-received'  // incoming shielded transfer (synthesized from chain history)
  | 'yield-deposit'               // shielded USDC → shielded vault shares
  | 'yield-withdraw'              // shielded vault shares → shielded USDC
  | 'consolidate'                 // merge a token's small notes (unblocks a fragmented spend)

// Execution state is separate from the protocol stage, so "where in the lifecycle" and
// "which protocol step" never blur (e.g. `waiting` on a CCTP attestation).
type TxExecutionState =
  | 'pending' | 'active' | 'waiting' | 'retrying'
  | 'completed' | 'failed' | 'expired' | 'cancelled'

interface TxRecord<K extends TxKind = TxKind> {
  id: string                          // ulid, generated at submit (idempotency key)
  kind: K
  executionState: TxExecutionState
  stage: StageFor<K>                  // protocol position, per kind
  stagesCompleted: StageFor<K>[]
  updatedSeq: number                  // monotonic OCC counter: every transition increments it
  createdAt: number
  updatedAt: number
  meta: MetaFor<K>                    // what the user approved, captured at submit
  artifacts: Partial<ArtifactsFor<K>> // hashes, delivery data, errors — accumulated per stage
  walletContext: TxWalletContext      // { evmAddress, shieldedWalletId, sourceChainId } — immutable
}
```

Each kind declares its stage sequence, terminal-success stage, retryable stages, per-stage time estimates and a
duration cap (`maxDurationMs`: 10 min same-chain, 15 min yield and `consolidate`, 60 min cross-chain). Example:

```ts
const unshieldXchain: TxLifecycle<'unshield-xchain'> = {
  kind: 'unshield-xchain',
  stages: ['build-proof', 'submit-relayer', 'hub-burn-confirmed',
           'iris-attestation-pending', 'iris-attestation-ready',
           'client-mint-pending', 'client-mint-confirmed'],
  terminalSuccess: 'client-mint-confirmed',
  retryableStages: ['submit-relayer', 'iris-attestation-pending'],
  estDuration: { p50: 30_000, p90: 120_000 },
  stageEstimates: { /* usualMs / slowMs for the long waits */ },
  maxDurationMs: 60 * 60_000,
}
```

**Retry is manual only.** There is no automatic-retry policy: a buggy auto-resubmit could double-submit a shielded tx.
`retryableStages` only gates the user's "Try again".

### Storage (optimistic concurrency)

- **In memory:** `txListAtom` (all wallets) and `activeTxListAtom` (the active wallet's records, which every UI surface
  reads). Writes go through `upsertTxAtom`, which drops a stale write (`existing.updatedSeq >= incoming.updatedSeq`).
- **Persistent:** IndexedDB (`txHistory`), each record AES-256-GCM-encrypted under the wallet's `historyEncryptionKey`.
  `putTxIfFresh()` enforces the same OCC. `useTxHistory()` loads the active wallet's records on unlock.
- **Terminal-write guard:** both layers refuse to move a record from a terminal state back to a non-terminal one,
  whatever its `updatedSeq` — except into `retrying` (an explicit retry) and terminal → terminal (history recovery
  upgrading a record to `completed`).
- **Resume on unlock** (leader tab only): past its cap → `expired`; already broadcast (has `sourceTxHash`) →
  re-attach the watcher, safe because every submit stage is idempotent; otherwise → `failed` with `INTERRUPTED`
  ("nothing was sent"). Resume never re-broadcasts and never re-prompts the wallet.

### Per-tx hook (not a singleton)

```ts
const tx = useTx({ kind: 'shield' })
// tx.submit(meta), tx.record, tx.retry(), tx.cancel()
```

Many `useTx` instances coexist, each owning its record id. The hook dispatches into the executor (§7) but never
orchestrates — this is what fixes the committer's single-tx limit.

## 7. Tx execution engine

The executor lives at **module scope** in `src/lib/tx/executor.ts`, not inside a hook. Hooks call `executeTx(id)` /
`cancelTx(id)`; the engine runs the handler chain in a fire-and-forget promise.

### Why outside React

Inside `useTx`, the stage pipeline would hit StrictMode double-mounts (duplicate handlers for one tx), unmounts
mid-stage (orphaned pollers), stale closures, and races between mounted instances. At module scope, hooks are thin
subscription wrappers.

### Architecture

```
TxRecord (persisted) → executeTx(id) → handler.run(record, ctx)
                                       ↓
                                ctx.upsert(nextRecord) — atom + IDB (OCC)
                                       ↓
                              chain loop reloads, decides the next step
```

- `registerHandler(handler)` — each `features/<area>/index.ts` registers its kind's handler; `App.tsx` imports them.
- `startEngine()` — called once from `App.tsx`. Idempotent. Takes the leader lock. (Resume runs later, on unlock.)
- `executeTx(id)` — runs the handler chain; reentrancy-guarded; a no-op on a non-leader tab.
- `cancelTx(id)` — aborts the handler chain. A record with no broadcast hash becomes `cancelled`; one already
  broadcast is marked `DISMISSED` instead (stopped tracking — the on-chain tx runs regardless; the hash is kept for the
  explorer). `cancelAllRunning` does the same for every running tx on an EVM account switch.
- A no-progress backstop fails a record `STUCK` if `run()` returns having written nothing.

### Leader election and the single-tab rule

`startEngine()` requests the exclusive `navigator.locks` lock `armada-tx-executor` with `ifAvailable: true`; only the
holder runs handlers. In practice a second tab can't run at all — the SDK allows one scan database per origin — so a
tab that doesn't get the lock shows the full-screen `SingleTabGate` instead. There is no cross-tab live sync.

### Visibility gating

On the leader, the chain loop pauses between `run()` calls while the tab is hidden, but only once the tx has a
broadcast hash; work before broadcast continues. Hidden time is credited back against the duration cap.

### Stage handler contract

```ts
interface StageHandler<K extends TxKind> {
  kind: K
  run(record: TxRecord<K>, ctx: ExecutorCtx<K>): Promise<void>
  resumableFrom: ReadonlyArray<StageFor<K>>
}
```

A handler runs one stage: it writes transitions through `ctx.upsert(...)`, honours `ctx.signal`, and returns when the
stage is done or parked at `waiting`. The chain loop reads the updated record and runs the next stage, pauses, or
stops at a terminal state. The outer try/catch shape and its known bug (#153) are in `src/lib/tx/CLAUDE.md`.

### UI: one progress view for every kind

The in-flight processing view (`components/tx/processing/`, rendered by `components/flow/ProgressStep`) renders any
record from its `stage` and the kind's lifecycle. Each kind's copy lives in exhaustive `Record<TxKind, …>` maps, so the
compiler flags a new kind's missing copy.

## 8. Fees

- `useFees()` is a React Query hook mounted by each fee-consuming flow (not app-wide), so `/fees` is fetched only
  while such a modal is open. It refetches on a fixed client-clock cadence (30s before the 4-minute staleness window,
  `FEE_QUOTE_STALE_AFTER_MS`), paused while the tab is hidden; it never schedules off the relayer's `expiresAt`, so
  clock skew can't cause a refetch storm. The hub quote is mirrored into `feeQuoteAtom`; nothing is persisted.
- **At submit, every relayer-paid path** (spends, merge, gasless shield) **fetches a fresh quote**
  (`lib/tx/submitQuote.ts::resolveFreshQuote`) for a fresh `cacheId`; the direct wallet-paid shield needs no quote. If
  the fee differs from what the user reviewed, the flow returns to Review with the fee-updated banner rather than
  silently swapping the fee.
- **Spends are priced by plan, not by quote.** The SDK may split a send into several proofs or fold small change into
  the fee, so Review shows the planned total; every spend builder refuses to prove above the reviewed total
  (`assertReviewedFee`).
- A relayer `FEE_EXPIRED` rejection fails the tx as "start over"; retry is gated off.
- Review warns on fees over 10% of the amount and requires an "I understand" tick over 25% (`lib/fees/highFee.ts`).
- What each figure means on every surface: `specs/TX_VALUES.md`.

## 9. Wallet, keys and the security boundary

- **EVM wallet:** RainbowKit + wagmi. No custodial logic.
- **Shielded identity is derived, not generated.** Sign-in asks the EVM wallet for a deterministic EIP-712 signature;
  HKDF turns it into a `root_secret`, and the SDK derives the shielded keyset and 0zk address from that. The same
  wallet and account always re-derive the same identity, so re-signing is the primary recovery path; a backup file
  (passphrase-encrypted, PBKDF2-SHA-256 at 600k → AES-256-GCM) or the pasted recovery secret covers smart-account
  wallets and other devices. Spec: `specs/TX_SIGNING.md` + `specs/TX_SIGNING_V2_AMENDMENT.md`; code:
  `lib/crypto/`, `lib/shielded/wallet.ts`.
- **Nothing secret is persisted.** Key material lives in memory only (`lib/shielded/keyManager.ts`) and is zeroized on
  lock. The SDK encrypts its note data at rest under the viewing key; tx history and request links are encrypted under
  `historyEncryptionKey`.
- **Session-bound unlock:** auto-lock after inactivity (default 15 min; 5 / 15 / 30 in Settings), after 5 minutes
  hidden, on tab close, and on an EVM account switch. A reload requires signing in again.
- **Never log secrets.** No `console.log` / `console.debug` in `lib/shielded/`; telemetry is a typed registry (§14).
  There is no ESLint config, so these rules are enforced by review.
- **Settings:** export the recovery secret or a backup file (confirm-gated), lock now, reset the wallet.
- Quick-sync trust model and residual risks: `SECURITY.md`. Full secret-handling rules: `lib/shielded/CLAUDE.md`.

## 10. Deployments and env

- `VITE_NETWORK`: `local` (default) or `sepolia`. `config/network.ts` resolves the hub and client chains, RPCs,
  relayer, indexer and CCTP settings; `VITE_ENABLED_CLIENTS` picks which client chains are on.
- `config/deployments.ts` loads the hub and each client chain's manifest on first use, cached and single-flight. Local
  dev serves them from an armada-poc checkout via the `serveDeployments()` dev plugin; hosted builds fetch the Sepolia
  manifests at build time into `public/api/deployments`.
- Local dev runs three Anvil chains — hub `:8545`, clients `:8546` / `:8547` — started from armada-poc.
- ZK circuits load from `VITE_ARTIFACTS_BASE_URL` (or same-origin `/artifacts`), SHA-256-checked against the
  committed manifest: `docs/CIRCUIT_ARTIFACTS.md`.
- Hosts, env vars and the CSP: `DEPLOYMENT.md`. Local vs hosted differences: `LOCAL_VS_DEPLOY.md`.

## 11. Polling and caching

App-side request/response polling goes through React Query and stops while the tab is hidden
(`refetchIntervalInBackground: false`). The exception is the executor's in-flight polls (the last two rows): they run
inside a handler's `run()` via `lib/tx/poller.ts` and keep going while hidden — the chain loop pauses only between
stages (§7).

| What | Owner | Cadence |
|---|---|---|
| Wallet USDC (hub + every client chain) | `useUsdcBalances` | 15s |
| Shielded sync | `useShieldedSyncPoll` (+ `useShieldedWatch` floor) | 15s; 5s while a tx is in flight; 3s for a minute after; 30s floor |
| Shielded balances | SDK balance events → `useShieldedBalanceSync` | on each sync |
| Vault rate / APY | `useYieldRate` | 5 min, plus a pull on open and after a submit |
| Fees | `useFees` (§8) | ~3.5 min while a fee flow is open |
| Relayer / indexer health | `useRelayerHealth` / `useIndexerHealth` | 60s |
| Relayer `/status` for a submitted tx | executor stage handler (`pollRelayStatusOnce`) | 4s |
| Cross-chain delivery | executor stage handler (relayer CCTP status, then a bounded `MessageReceived` scan) | 3s |

In-flight tx polling belongs to the executor's stage handlers, not React: each gets `ctx.signal`, so `cancelTx`
stops its pollers. `eth_getLogs` is always bounded (root `CLAUDE.md`). One `useTabVisible` listener feeds
`tabVisibleAtom`, which the app-level pollers and the executor's between-stage gate read (the health probes rely on
React Query's own background pause). Two components keep their own `visibilitychange` listener: `useAutoLock` (the
hidden-tab grace timer) and `SendRecipientStep` (re-checking the clipboard).

## 12. Pages and routes

- `/` — Dashboard: the balance spot (sign-in card → sync progress → balance card, whose action row holds Shield · Send ·
  Request · Earn), and recent activity with an "All activity" panel. Every action is a **modal flow**, not a page.
- `/debug` — developer tools (relayer / indexer health, tx and sign-in timings, notice previews, per-chain balances with
  a local faucet, contract addresses).
- `/address-book` — parked placeholder, not linked from anywhere.
- `/pay-via-link` — the standalone payer landing for a payment-request link, outside the app shell.

Settings is a modal opened from the header gear. There is no history page and no header nav.

## 13. Decisions

The scaffolding plan's decision log, numbers kept as IDs. **Holds** = still true; **Changed** = still in force in a
different form; **Superseded** = replaced, with what replaced it.

| # | Decision | Status |
|---|---|---|
| 1 | Workspace at `apps/armada-interface/` | Superseded — standalone repo |
| 2 | Package name `@armada/interface` | Holds |
| 3 | Vite dev port 5176 | Holds |
| 4 | `VITE_NETWORK` selects the env (local / sepolia) | Holds |
| 5 | Three Anvil chains for local dev (8545 / 8546 / 8547) | Holds |
| 6 | Backend = indexer or REST API only | Changed — the relayer (fees, relay, status, health, CCTP delivery status) and the watcher indexer (SDK quick-sync); still no auth or oracle |
| 7 | Generate a BIP39 mnemonic on first run | Superseded — identity derived from an EIP-712 signature (§9) |
| 8 | Passphrase-derived AES-GCM encryption at rest | Superseded — no key material is persisted; history is encrypted under a derived key; the passphrase only protects the backup file |
| 9 | Modal flows for every action | Holds — but pages are Dashboard / Debug / AddressBook / PayViaLinkLanding (§12) |
| 10 | Address book parked as a placeholder | Holds |
| 11 | Telemetry = console-only structured logger | Changed — errors also go to Sentry, DSN-gated (§14) |
| 12 | No strict bundle budget | Changed — the entry chunk has a CI budget and the SDK loads lazily (`scripts/check-entry-size.mjs`, `lib/shielded/sdk-loader.ts`) |
| 13 | Duplicate generic utilities into `lib/` rather than extract a shared package | Holds (§3, §16) |
| 14 | `useTx` supports many instances at once | Holds |
| 15 | One visibility listener publishes an atom; pollers gate on it | Holds for the app's pollers (§11) — `useAutoLock` and `SendRecipientStep` keep their own listeners, which aren't pollers |
| 16 | TypeScript `strict` + `noUncheckedIndexedAccess` | Holds |
| 17 | ESLint: no `ethers` / `@railgun-community/*` imports in `components/**` | Changed — the rule holds as a convention; there is no ESLint config, so review enforces it |
| 18 | ESLint: no `console.log` / `debug` in the shielded lib | Changed — same: a convention, enforced by review, backed by the typed telemetry registry |
| 19 | `eslint-plugin-jsx-a11y` from day one | Superseded — not set up |
| 20 | Execution state separate from protocol stage | Holds |
| 21 | `updatedSeq` optimistic concurrency on `TxRecord` | Holds — plus the terminal-write guard (§6) |
| 22 | `walletContext` on every record | Holds — `{ evmAddress, shieldedWalletId, sourceChainId }` |
| 23 | Per-kind `maxDurationMs` + retry policy | Changed — per-kind caps hold; retry is manual only (§6) |
| 24 | Plural shielded-wallet schema while the UI is singular | Holds — `shieldedWalletsAtom` |
| 25 | Tx executor at module scope, not in React | Holds |
| 26 | Single-leader execution via `navigator.locks`, no follower live sync | Holds — a second tab is gated entirely (§7) |
| 27 | Swappable `EventSource` interface (RPC / indexer) | Superseded — the SDK owns pool-event fetching (RPC, plus root-verified indexer quick-sync) |
| 28 | Typed telemetry `EventRegistry` | Holds |
| 29 | Fee validator with absolute + ratio bounds | Superseded — fresh quote at submit with re-review, the reviewed-fee cap in every builder, and the high-fee warning (§8) |
| 30 | Lazy-init engine with a warmup atom | Superseded — the SDK is a lazily loaded chunk, prefetched once the shell is up; the prover worker starts on the first proof; no warmup atom |
| 31 | Best-effort memory zeroization of key buffers | Holds — `keyManager.clear()`; `sdk.close()` wipes the SDK's keys |
| 32 | WebAuthn-friendly encryption schema (KEK / DEK) | Superseded — nothing persisted to wrap; WebAuthn-wrapped keys remain a future hardening (`lib/shielded/CLAUDE.md`) |

## 14. Telemetry

`lib/telemetry.ts` exposes `track(event, props)`, `trackTxTransition(...)` and `trackError(scope, err, props?)`.
Events are typed by an `EventRegistry` — adding an event means editing the registry, which is the privacy review
surface. Events are logged to the console with stable prefixes; `trackError` also forwards the error to Sentry when a
DSN is configured (`lib/sentry.ts`, which scrubs addresses and long hex). Never emit amounts, recipients or anything
tied to a shielded identity. Handler failures are reported once, from the executor (`lib/tx/failureReport.ts`); `STUCK` and `INTERRUPTED` have their
own events.

## 15. Out of scope / deferred

- e2e tests.
- A remote sink for the structured `track()` events (only errors reach Sentry).
- Service worker / offline support.
- i18n.
- Hardware-wallet flows beyond what wagmi covers.
- Cross-tab live sync.
- Mnemonic import — identity is signature-derived (§9).

## 16. Extraction tracking

When this app and the crowdfund apps both need to evolve the duplicated utilities (§3), extract them into a new
`@armada/eth-utils` package that both depend on, and delete the copies here. Don't do it preemptively — only when the
duplication causes friction.

## 17. Open questions

- **Hardware wallets:** Ledger / Trezor signing (including the deterministic sign-in signature) needs real testing
  before the app claims support.
- **History at scale:** history is rebuilt from the SDK's scan and stored locally; at what size does it need paging or
  a different store?

Answered since the plan: an indexer exists (the relayer's watcher serves root-verified quick-sync to the SDK); there is
no browser-side Iris polling (the relayer reports CCTP delivery, with a bounded `MessageReceived` scan as fallback);
and the shielded identity is tied to the EVM wallet and account that signed (one identity per EVM address and account
index).
