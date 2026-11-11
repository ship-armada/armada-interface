# lib/shielded/

Shielded-wallet lifecycle, proof generation, and tree sync — built entirely on `@armada/sdk`. Nothing
here depends on the stock `@railgun-community/*` engine. Runtime strings follow the naming rule in
`lib/CLAUDE.md` (never emit "railgun").

## Files

| File | Purpose | Status |
|---|---|---|
| `wallet.ts` | Signature-derived sign-in (`enrollFromSignature`, called by the `useShieldedWallet().signIn` hook) + unlock-by-paste (`unlockFromRootSecret`) + unlock-by-backup (`unlockFromBackup`) + lock + reset. The per-(EVM address, account) localStorage maps (`armada.shielded.walletIds` / `armada.shielded.checksums`) keep a returning user's walletId and back the cached-checksum determinism check. Records the unlock binding on `keyManager` for account-switch detection. | Working |
| `schema-migration.ts` | V2 schema-version bootstrap migration. On cold boot, if `armada.shielded.schemaVersion < 2`, wipes legacy localStorage keys + drops the `armada-shielded` + `armada-interface` IndexedDB DBs. Idempotent. | Working |
| `keyManager.ts` | Module-scope unlocked-state singleton — owns the live `rootSecret`, walletId, `historyEncryptionKey`, `creationBlock`, shielded (0zk) address, checksum, evmAddress + account binding. Zeroizes the `rootSecret` + `historyEncryptionKey` buffers on `clear()`. | Working |
| `artifactGetter.ts` | In-memory ZK-circuit artifact registry keyed by padded circuit shape (`NNxMM`). `circuitFetch.ts::ensureCircuitLoaded` writes it — for the post-sign-in preload and each spend's planned shapes (`artifacts.ts`) and for a proof's own lazy load; the `@armada/sdk` ArtifactSource (`sdk-prover.ts`) resolves circuits from it. Owns the local `ArmadaArtifact` type. | Working |
| `nullifierCrossCheck.ts` | WI-5 safety net: after a scan, queries the hub PrivacyPool's `nullifiers(...)` for the wallet's own unspent notes (`wallet.spendableNullifiers()`), batched into one Multicall3 `aggregate3` eth_call (`lib/multicall3.ts`). Catches a watcher that omits a `Nullified` event (which merkleroot validation can't see). Fails open on RPC error. Bridge hook: `hooks/useNullifierCrossCheck.ts`; gate: `hooks/useSpendableSyncGate.ts`. | Working |
| `network.ts` | Pure-ethers hub-chain RPC helper: `timeoutProvider` (timeout-bounded JsonRpcProvider, used by the nullifier cross-check and cross-chain recovery). No engine coupling. History timestamps come with the SDK's entries — never fetch them per wallet block (that told the RPC which transactions are the wallet's, armada-sdk#135). | Working |
| `artifacts.ts` | Warms ZK circuit shapes into the `artifactGetter` registry (via `circuitFetch`) so a proof doesn't wait on a fetch: the two shapes a typical spend uses (01x03, 02x03: 1–2 inputs + change + relayer fee; ~33 MB), one at a time, once the wallet is signed in (`hooks/usePreloadCircuits` → `preloadArtifactsFromOrigin`; a visitor who never signs in downloads none, #144), and each spend's own planned shapes as soon as review plans it (`warmPlannedCircuits`, called by `planTransferFee`, `checkSpendPlans` and `previewConsolidation` — so a swept 4x3, a fold-in's 5x2 / 6x2 or a split's groups download while the user reviews). Anything else lazy-loads at proof time. | Working |
| `circuitFetch.ts` | Fetches a shape's `{zkey,wasm,vkey}` from the configured artifact host (`VITE_ARTIFACTS_BASE_URL`, default same-origin `/artifacts`), SHA-256-verifies each against the committed `config/circuits.manifest.json`, de-dupes concurrent fetches, and populates the registry. 404 / hash-mismatch → hard error, no IPFS fallback (#6). | Working |
| `balance-bus.ts` | SDK-native leaf module (imports nothing) with two channels: a balance-change bus (fans the `@armada/sdk` wallet's `scan:complete` / `balance:updated` / `note:received` events out as "something changed" pings, plus a `hold` ping from `pending-spend.ts` when a spend hold is placed or released) and a scan-status bus (`emitScanStatus` / `subscribeScanStatus` — carries scan lifecycle + progress fraction that drives `syncStateAtom`). `sdk-read.ts` installs the `wallet.on(...)` forwarders; consumers subscribe via `sync.ts`. | Working |
| `sync.ts` | Thin facade: re-exports the balance bus (`subscribeBalanceUpdates` / `subscribeScanStatus` / `resetSyncState`) + `refreshShieldedBalances` (from `sdk-read.ts`) so consumers keep one import surface. `hooks/useShieldedBalanceSync.ts` reads on each ping + drives `syncStateAtom` off scan status; `hooks/useShieldedSyncPoll.ts` drives the periodic `wallet.sync()`. | Working |
| `sdk-loader.ts` | The one runtime door to `@armada/sdk`: `loadSdk()` (a memoized dynamic import — a failed load is forgotten, so the next call retries) and `prefetchSdk()`. Every other file imports SDK types only, so the SDK stays out of the entry chunk (13C; `src/test/sdk-imports.test.ts`). | Working |
| `sdk-read.ts` | The `@armada/sdk` shielded read path — a persistent IndexedDB-backed SDK instance (`ensureInstance`/`closeSdkRead`). Sole source of all shielded balance + history reads. **Sync vs read are split**: `refreshShieldedBalances` is the ONLY syncer (`wallet.sync()`, driven by the sync poll (`hooks/useShieldedSyncPoll`: 15s, tighter while a tx runs and just after) + post-tx refresh + initial unlock); `readSdkUsdcBalance` / `readSdkYieldShares` / `readSdkHistory` — and, for the projected headline, `readSdkHeldSpendTxids` (`wallet.pendingSpendTxids()`) / `readSdkSyncedThrough` (`syncStatus().syncedThrough`) — read the current scan state WITHOUT syncing (called from balance-bus event handlers, which fire because a sync just completed — re-syncing there is circular). `readSdkNoteCounts` (spendable notes per mergeable token) + `mergeTokenAddress` resolve the merge flow's inputs. | Working |
| `sdk-telemetry.ts` | Leaf module — the `TelemetrySink` handed to `createArmadaSdk`. Maps the SDK's `sync.quicksync` event → `track('sdk.quicksync')` so an operator can confirm a configured indexer (watcher) is actually serving a root-verified batch (`served`, `tailCovered` on tail-lag) vs being rejected (`root-mismatch-fallback`). On fallback it also forwards the classified `reason` (indexer-http-error / schema-mismatch / root-mismatch / position-gap / unknown) + HTTP `status`, so the discard cause is observable. Emits nothing on RPC-only syncs. The SDK types every event's payload (`TelemetryEventMap`); the sink ignores its other events (`sync.reorg-recovery`, `storage.chain-reset`). | Working |
| `history.ts` | Chain-driven history recovery — `runHistoryScan` reads the `@armada/sdk` wallet's history from its current scan state (`readSdkHistory` — no sync), maps each `HistoryEntry` → `TxRecord` (`historyEntryToTxRecord`, pure) using the block timestamp the SDK recorded on the entry, and returns a checkpoint candidate. `syntheticTxId` encodes deterministic ids. Yield ops classified natively by the SDK. A spend tagged `consolidation` in its self-metadata (`selfMetadata.ts`, wire `m`) maps back to a `consolidate` record — a merge has no recipient output, so the SDK alone would recover it as an anonymous `transfer-sent`. Recovered unshields store the gross amount + any protocol unshield fee (as authored records do), and a cross-chain unshield the CCTP fee estimate read back from its burn's `maxFee` (`cctpFeeEstimateFromMaxFee`), so recovered receipts match the authored ones. A cross-chain unshield is recognised by the hub CCTP `MessageSent` in its tx (`xchain-recovery.ts` checks every recovered shield and unshield); its recipient is the `Unshield` event's final recipient. A `self-transfer` (a send to the wallet's own 0zk) maps to a merge. `test/integration/recovery-roundtrip.test.ts` runs every kind through the SDK's real `reconstructHistory` and checks the recovered figures equal the recorded ones. Value rules: `specs/TX_VALUES.md`. | Working |
| `history-checkpoint.ts` | Per-wallet localStorage checkpoint (`armada.shielded.historyScanBlock.<walletId>`) so incremental scans only walk the delta since the last `block`. Wiped on Settings → Reset wallet and Settings → Re-scan history. | Working |
| `transfer-sdk.ts` | Private-send builder: `buildTransferSdk` plans (possibly split into several proofs for a fragmented wallet), runs one batched `preflight(plans)`, `proveAll(plans)` (one signing batch, progress across all proofs), and combines everything into one `transact([...])`. Returns `totalFee` (sum of the plans' fee notes) and refuses with `SpendFeeIncreasedError` if that exceeds the reviewed `maxTotalFee`. `planTransferFee` / `maxTransferAmount` price a send without proving, for review time (`hooks/useTransferFeePlan`); `maxTransferAmount` is the SDK's `wallet.maxTransferAmount` (the planner's own rules: one tree, one fee per proof, the 4-proof cap), so it can be less than balance minus a fee. | Working |
| `consolidate-sdk.ts` | Consolidation builder (armada-sdk #98): `buildConsolidateSdk` → `wallet.consolidate` (one token; old-tree notes first, then smallest; up to 4 proofs, one USDC per-proof fee each) → reviewed-fee cap (`SpendFeeIncreasedError`) → batched preflight → stash → `proveAll` → one `transact([...])`. Returns `totalFee` + the token's `notesMerged` / `notesCreated`. `previewConsolidation` prices it without proving and, given the blocked spend, dry-runs it on the post-merge wallet (`blockedWillWork`). `checkSpendPlans(request)` dry-runs a spend against the current notes and returns the fee it plans (`hooks/useSpendCheck`: review-time fee + fragmentation check). | Working |
| `merge-intent.ts` | What the merge-notes flow opens with: `MergeToken` (`usdc` / `shares`), `mergeIntentFromRecord` (the token + blocked spend of a record that failed for fragmentation), `blockedSpendRequest` (the SDK request that reproduces that spend's circuit shape for the `planTransferAfter` dry run), labels, and `MERGE_SUGGEST_NOTE_COUNT` (5 — unshields / vault ops have no circuit above 4 inputs). | Working |
| `spend-fee-error.ts` | Leaf module (no imports): `SpendFeeIncreasedError`, so `lib/tx/errors` can classify it (→ `FEE_EXPIRED`, start over) without pulling in the SDK. | Working |
| `unshield-sdk.ts` | Unshield builder (`buildUnshieldSdk`: plan → reviewed-fee cap → preflight → stash → prove → `transact` calldata, returning the fee actually charged) and the unshield flows' Max, `maxUnshieldAmount` (the SDK's `wallet.maxUnshieldAmount`; a vault deposit shares it). Sibling builders: `unshield-xchain-sdk.ts`, `yield-sdk.ts`. The cross-chain builder passes the decoded CCTP `adaptBinding` alongside `adaptParams`: the SDK requires it for a cross-chain unshield, so it can reject a `maxFee` that isn't below the amount before proving. | Working |
| `spend-fee.ts` | `totalFeeOf(plans)` (the fee a spend's plans charge — the sum of their fee notes, which can exceed the per-proof quote: several proofs, or small change folded into the fee) and `assertReviewedFee(totalFee, maxTotalFee)` — the reviewed-fee cap every spend builder (transfer, unshield, xchain unshield, yield, merge) applies before proving. Also `returnsToSelfOf(plans, ownAddress)` — what the plans return to the wallet (each plan's change plus outputs to its own 0zk), which every builder returns and its handler saves as `artifacts.returnsToSelf` for the projected headline (spec G-12). | Working |
| `pending-spend.ts` | armada-sdk #55 in-flight double-spend guard: builders `stashSpendPlan(recordId, plans)`, handlers `await markSpendPendingForRecord` after broadcast (all groups at once) and `await clearSpendPendingForTx` on revert — the SDK resolves each once the hold/release is written to storage, so a hold survives a reload from then on (both bridges never throw; failures go to `trackError`). Every spend handler's outer `catch` calls `forgetSpendPlan(record.id)`, so a build/submit that never broadcasts doesn't leave plans in memory. A written hold or release pings the balance bus (`hold`), so the projected headline (spec G-12) moves at broadcast, not the next poll. | Working |
| `preflight.ts` | `assertSpendPreflight(wallet, plan \| plans)` — runs `wallet.preflight` (root freshness + nullifier-unspent, no fee quote) before proving and throws the SDK's typed error on a failed finding, so a doomed spend fails in under a second instead of after a ~30s proof. Every spend builder calls it after the reviewed-fee cap. | Working |
| `sdk-prover.ts` | The write-path wiring handed to `createArmadaSdk`: `createInterfaceProver(armada)` (the SDK's Web Worker snarkjs prover, started on the first proof) and `createInterfaceArtifactSource()` (resolves circuits from the `artifactGetter` registry, lazy-loading a miss via `circuitFetch`). Reports `sdk.proof` / `sdk.artifact.resolve` timings. | Working |
| `shield.ts` | `generateRandomShieldPrivateKey()` (a fresh random per-deposit ECIES sender key) + the `ShieldRequestData` shape (npk / value / encryptedBundle / shieldKey / random). | Working |
| `shield-sdk.ts` | `createShieldRequestSdk(0zk, amount, token, shieldPrivateKey)` — builds one shield note via the SDK's `buildShieldRequest` in the `ShieldRequestData` shape. Used by both shield handlers for the user's note and the relayer fee note. | Working |
| `shieldReconcile.ts` | After a shield confirms, `recordedShieldFees(hubTxHash)` syncs, finds the hub tx's history entry and returns the pool's actual protocol fee + the relayer fee paid, replacing the review-time figures (same-chain and cross-chain shield). | Working |
| `requestLinks.ts` | Created payment-request links (`saveRequestLink` / `loadRequestLinks`) in the `requestLinks` IDB store, AES-256-GCM-wrapped under `historyEncryptionKey` like tx history; another wallet's records fail to decrypt and are skipped. No-op while locked. | Working |
| `xchain-recovery.ts` | `buildXchainCctpMap` — for every recovered `shield` / `unshield`, fetches the hub receipt and reads its CCTP events (a `MessageReceived` → cross-chain shield with its source domain + burn amount + fee; a `MessageSent` → cross-chain unshield with its destination + `maxFee`). An unfetchable receipt is marked `unresolved` so recovery retries it. | Working |
| `selfMetadata.ts` | Codec for the small self-metadata blob a spend writes into its change-note memo (fee quote id, gasless flag, yield APY, consolidation tag) so a fresh chain scan recovers what the chain alone can't. | Working |
| `unshield-xchain-sdk.ts` / `yield-sdk.ts` | The cross-chain unshield builder (`atomicCrossChainUnshield` calldata, CCTP `adaptBinding`) and the vault builder (`lendAndShield` / `redeemAndShield` on the yield adapter). Same plan → fee cap → preflight → stash → prove sequence as `unshield-sdk.ts`. | Working |
| `enrollmentErrors.ts` | `normalizeEnrollmentError(err)` — turns sign-in failures (declined signature, missing manifests, circuit download, relayer down) into actionable copy for the sign-in card (`hooks/useSignIn`). Backup-restore errors use `lib/crypto/kdf.ts::normalizeBackupUnlockError`. | Working |

## Secret-handling rules (HARD)

Privacy apps routinely leak through carelessly-written telemetry and dev logs. Belt-and-suspenders rules for everything in this directory:

1. **Never `console.log` / `console.debug` the root secret, viewing keys, spending keys, the history key, or anything derived from them.** Use `lib/telemetry.ts::track` for structured events with allowlisted shapes — the registry won't let a key slip through.

2. **Memory zeroization** (reviewer rec #11):
   - Where the SDK gives us key material as `Uint8Array`, `fill(0)` after use.
   - Avoid holding secret material as a JS string when avoidable — strings are interned and cannot be zeroized. Prefer `Uint8Array`; convert at the boundary only (e.g. the hex shown by Settings → Export recovery).
   - Key material never goes on `window`, in localStorage, or in a Jotai atom.
   - JS makes zeroization imperfect (V8 may move buffers), but the discipline still meaningfully reduces leak surface.

3. **Encryption at rest.** Be precise about what the SDK encrypts vs. what it doesn't:
   - **Shielded reads run through the `@armada/sdk` read instance** (`sdk-read.ts`), which persists its
     scan state in a per-deployment IndexedDB database (`armada-shielded-scan-e2-<chainId>-<pool>`),
     separate from the historical stock-engine `armada-shielded` DB.
   - **Decrypted note plaintext — encrypted at rest, SDK-owned (§4.3) ✅.** The interface passes the SDK a
     **raw** `IndexedDBStorageAdapter`; the SDK auto-wraps it **per wallet** in an `EncryptedStore` keyed from
     the **viewing private key** (AES-256-GCM, record-key bound as AAD), held only in memory. The DB holds
     only ciphertext at rest — a tab crash / disk read leaks no decrypted note data (value, recipient/sender
     0zk, memo). Locking tears the instance down (`closeSdkRead`) → the SDK's key is dropped, and `sdk.close()`
     disposes the wallet: it wipes the viewing key and the spend key held by the SDK's default signer. **Don't
     pass a `signer` to `fromRootSecret`** — the SDK only wipes a signer it made. Calls still in flight at the lock
     reject with `INSTANCE_CLOSED`; `trackError` doesn't report those, and the tx classifier maps them to
     `CANCELLED`. Settings → Reset deletes the DB. Prior-schema DBs (pre-encryption plaintext + the interface's earlier `-e1` rootSecret-keyed
     wrap) are best-effort deleted on the next unlock so nothing stale lingers. We never set the SDK's
     `dangerouslyAllowPlaintextStorage` escape hatch. **Do NOT re-wrap the adapter in `EncryptedStore` here —
     the SDK owns this; wrapping would double-encrypt under a mismatched key.**
   - **Tx history + request links — encrypted.** Every `TxRecord` persisted by `lib/tx/storage.ts` is wrapped via `lib/crypto/cache-cipher.ts` as AES-256-GCM (`{ nonce: hex, ciphertext: hex }`) under `historyEncryptionKey` (HKDF-Expand from `rootSecret`, info=`'armada-tx-history:v1'`). `requestLinks.ts` wraps created payment-request links the same way. Foreign-wallet records throw on `unwrap` and get silently skipped at hydration. The envelope deliberately carries no plaintext walletId — isolation is purely key-based.

4. **Session-bound unlock.** Decrypted key material is held in memory for the active session only. **Inactivity timeout** auto-locks (zeroizes): default 15 min, user-selectable 5 / 15 / 30 in Settings (`preferences.autoLockMinutes`). Lock also fires on tab unload (`beforeunload`), after a **5-minute tab-hidden grace period** (`visibilitychange`), and on EVM-account switch (`useWallet` compares wagmi's address against `keyManager.getEvmAddress()` and locks on mismatch). Reload requires re-signing.

5. **No raw secret in URL, in clipboard for longer than necessary, or in error messages.** Export UX (Settings → Export recovery) shows the recovery secret in a confirm-gated modal and clears it on close. The EIP-712 signature itself is also subject to discipline: no transmission, no persistence, no logging, zeroize after HKDF derivation. The future ESLint rule for mechanical enforcement is deferred to v2 (see `specs/TX_SIGNING_V2_AMENDMENT.md`).

## Proving warmup

Proving runs on an off-main-thread Web Worker: `sdk-prover.ts::createInterfaceProver(armada)` (given the loaded SDK module) hands the SDK's
`createWorkerProver` a worker factory, and the SDK spawns the worker (snarkjs + `@armada/sdk/prover`) on
the FIRST proof, so read-only sessions never pay for it. If the worker crashes (e.g. out of memory) or a
proof is cancelled, the SDK terminates it and starts a fresh one on the next proof (a crash surfaces as
`ProverWorkerError` → a retryable `PRE_FLIGHT_REVERT`); it is terminated on `close()`. There is no separate engine-init step and
no atom-observable warmup state. The circuit artifacts the worker needs are preloaded into the `artifactGetter`
registry after sign-in (the two common shapes, `artifacts.ts::preloadArtifactsFromOrigin`), and each spend's planned shapes as soon as
it's planned at review (`artifacts.ts::warmPlannedCircuits`), so the download overlaps the user reading Review.

**Timings.** `sdk-prover.ts` reports each proof (`sdk.proof`: `durationMs`, `firstOfSession` — the page's first proof also
pays the worker start-up) and each circuit resolve (`sdk.artifact.resolve`: shape, `durationMs`, `cached` = no download).
Console-only, like all `track()` events.

## Spec compliance gaps tracked for v2

See `specs/TX_SIGNING_V2_AMENDMENT.md` §"Outstanding compliance gaps from this redesign":

- **Web Worker isolation for spending key operations** — spec mandates that spending-key derivation and proof signing run in a dedicated Web Worker. Proof generation already runs in a worker (see Proving warmup), but key derivation (`deriveKeyset` / `fromRootSecret`) and the SDK's `LocalSigner` intent signing still run on the main thread inside the SDK instance. Closing the gap needs SDK support for keeping the spend key and signer in a worker. (The amendment's own description of this gap still names the removed stock engine.)
- **ESLint rule for signature discipline** — `no-restricted-syntax` to mechanically catch `fetch(sig)` / `console.log(sig)` / etc. Deferred because the app has no eslint config yet.

## WebAuthn (future, not now)

V2 redesign accepted "deterministic re-sign from EVM wallet" as the primary recovery path. WebAuthn-wrapped key storage is the right v2 hardening (origin-bound, addresses the malicious-extension threat the current in-memory model doesn't fully cover). Future work; see `docs/ARCHITECTURE.md` decision 32.

## `creationBlock` invariant: always anchor at hub deploy block

A deterministic-re-sign wallet identity is purely a function of the EOA signature — there is no local bit that distinguishes "first ever creation" from "re-creation after the user cleared local storage on a wallet that already has chain activity." Both produce the same root_secret → same SDK walletId.

Consequence: if first-time enrollment seeded the SDK's `creationBlock` (the `fromRootSecret` option) at the *current* head (the obvious "fast path" choice), then a user who cleared local storage and re-signed would have their prior shields, transacts, unshields, and yield deposits silently amputated from the `@armada/sdk` wallet history AND from balance — the SDK only looks for the wallet's notes from `creationBlock` onward and never walks back.

**The fix:** `resolveCreationBlock()` always picks `hub.deployBlock`, or leaves `creationBlock` undefined when the manifest can't supply it — never the current head. Undefined makes the SDK look for notes from the start, which costs the same because its tree scan always begins at the pool's deploy block. Trade-off: every first-sign-in on a device pays the full chain scan cost (~10–30s on Sepolia, longer on mainnet at scale). Trade-off accepted because the alternatives have worse properties:

- **On-chain registry** (`EOA → first commitment block`) re-links the EOA to "has a shielded wallet," undoing the privacy property the EIP-712 sign just paid for.
- **Relayer-side registry** requires sharing the walletId with our infra, enabling cross-session correlation.
- **Optimistic + lazy backfill** (sign in fast, deep-scan in the background) is appealing but the SDK doesn't currently expose a clean API to extend `creationBlock` backwards on an existing wallet — would require deleting + recreating, which has its own footguns.
- **Asking the user** ("have you used this wallet before?") trades a slow scan for a silent-data-loss footgun if they answer wrong.

If a future SDK release ships a `walletForID(id).extendSyncRange(fromBlock)`-style API, switching to lazy backfill becomes viable — until then, anchoring at deploy block is correct.

## What we explicitly DON'T do

- Custodial fallback. No server-side key escrow, ever.
- Uploading the recovery secret or backup file / cloud sync. The user owns their recovery material.
- Direct interop with MetaMask / EVM wallet seed phrases. There is no seed phrase: the shielded identity comes from an EIP-712 signature (HKDF → `root_secret` → the SDK's `deriveKeyset`), and the EVM wallet's own keys are never read or reused (reviewer rec #5).
- Cross-device sync of the encrypted blob. The v2 model makes cross-device unlock work via re-sign, paste-secret, or backup-file restore — no sync-the-blob mechanism is needed or built.
