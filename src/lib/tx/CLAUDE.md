# lib/tx/

Transaction lifecycle model. The most important architectural surface in this app — read `.claude/PLAN_ARMADA_INTERFACE.md` §7 + §7a before touching.

## Files

| File | Purpose |
|---|---|
| `types.ts` | `TxKind` discriminated union; per-kind stage unions; `TxRecord<K>` with `executionState` + `stage` + `updatedSeq` + `walletContext`; `TxLifecycle<K>` with `maxDurationMs` + `retryableStages` (no auto-retry policy). |
| `lifecycles.ts` | One `TxLifecycle` per `TxKind` — stage sequence, terminal-success stage, retryable stages (for the user-driven "Try Again"), per-kind expiry cap, and `stageEstimates` (per-stage `usualMs` / `slowMs` for the long waits — proof, chain confirmation, cross-chain submit, CCTP attestation — measured on Sepolia via Debug → Tx timings, with headroom; a shield's wallet prompts and sub-second stages get none). |
| `eta.ts` | `stageTimingNote(timing, now)` — the progress view's note for its active row: `{ kind: 'usual', chip: 'Usually takes ~15 sec' }` while normal (when the stage has a `usualMs`; else null), or past `slowMs` `{ kind: 'slow', title: 'Taking longer than usual', body }` — the body says what's safe: USDC safe in transit (a broadcast cross-chain "Bridging" row), the tab can close (broadcast), or keep the tab open (not yet broadcast). `estimatedTimeLabel(kind, proofs)` — Review's "Est. time": the kind's `usualMs` estimates + `PROOF_MS` per proof, to the nearest 5s ("Usually takes ~15 sec"; cross-chain adds "· fast CCTP transfer"; a shield's wallet prompts aren't counted). |
| `reducer.ts` | Pure transitions: `advance`, `markWaiting`, `markRetrying`, `markFailed`, `markExpired`, `markCancelled`. Every transition increments `updatedSeq`. `advance` also stamps `stageEnteredAt[toStage]` (first entry only, so a retried stage keeps its first stamp); `useTx.submit` stamps the first stage. |
| `storage.ts` | IDB persistence: `putTxIfFresh` (OCC enforced via `updatedSeq`), `loadAllTx`, plus `putTx` (unconditional) and `deleteTx`, which no app code calls — tests use them to seed and clear records. |
| `executor.ts` | **Module-scope** execution engine. Runs stage handlers outside React, owns AbortControllers, leader-elected via `navigator.locks`. |
| `poller.ts` | Generic abortable / jittered / backoff-aware poll loop. Stage-specific adapters (Iris, RPC, relayer) plug in here. |
| `recentRecipients.ts` | Pure `deriveRecentRecipients(records, {hubChainId, limit})` — the Send flow's recent-recipients list from settled history (dedupe by normalized address, newest-first, completed-only, per-kind destination chain). Also `countSendsTo(records, address)` — settled sends already made to one address (Review's "New recipient" callout / "History" row). Consumed via `hooks/useRecentRecipients`. |
| `submitQuote.ts` | `resolveFreshQuote({refresh, reviewedFee, feeOf})` — every submit path (shield/unshield/transfer/yield) refetches a fresh `cacheId` right before proof gen (a stale cacheId is the relayer `FEE_EXPIRED` cause) and flags `feeChanged` when the fresh fee differs from the reviewed one, so the modal re-reviews (FeeUpdatedBanner) instead of silently swapping the fee. A private send additionally re-prices its split fee at the fresh quote (`useTransferFeePlan.priceAt`) and re-reviews on a different total. |
| `spendDraft.ts` | `spendDraft(kind, input)` — the record a private send / unshield review will submit (`TxDraft`: kind + meta), shared by the Send modal and the Unshield tab. Review renders it through `lib/fees/txFigures` and submit sends it (+ the fresh quote's cache id / broadcaster address), so the stored record is what Review showed (spec G-2, G-10). Every other flow builds its `TxDraft` the same way inline. |
| `notices.ts` | `detectTxNotices(prev, records, inView, now)` — which changes between two snapshots of the tx list deserve a notice outside the flow modal: a watched tx settling (`success`), failing (`failure`) or ending indeterminate (`uncertain`, via `txOutcome`), and a freshly received payment (`received`, only within `RECEIVED_NOTICE_MAX_AGE_MS` so history rebuilt from chain never reads as news). Records on screen (`inView`), a tx still in flight (the header pill names it) and a user cancel are silent; events carry a `TxNoticeOutcome` (every `TxNoticeTone` but `pending`, which only labels the pill). Driven by `hooks/useTxNotices`. |
| `timings.ts` | Debug-page timing stats: `stageTimings(records)` — per kind and stage, p50 / p90 of the gap from a stage's `stageEnteredAt` stamp to the next stamped stage (+ a `total` row), completed records only; `latencyTimings(samples)` — the completion → balance-change samples per kind; `percentile` (nearest rank). |
| `projectedBalance.ts` | `projectedBalance({ records, heldTxids, syncedThrough })` — what in-flight transactions add to the scanned balance (3B, spec G-12): a spend's `artifacts.returnsToSelf` (in its spent token: USDC, or shares for a vault withdrawal / shares merge) while its broadcast hash is in the SDK's held spends, and a same-chain shield's note (`txFigures.netAmount`) until `syncedThrough` reaches its `artifacts.hubBlock` (not after failed / cancelled / expired, not history with no block). Returns `{ usdc, shares, confirming }`. Read by `state/balanceProjection`. |
| `proofProgress.ts` | The proof ring's fill (2B): `easedProofProgress({ real, proofs, sinceMs })` — the record's real `proofProgress` (SDK checkpoints every half proof, across all of a spend's proofs), eased at `PROOF_MS` (2s per proof, measured) but stopping just short of the next checkpoint the SDK hasn't reported; `proofCount(record)` (total relayer fee / per-proof fee, else 1). |
| `cancelable.ts` | `canCancelBeforeBroadcast(record)` — the live progress view's "Cancel" (2G) is offered only while a relayer spend is in `build-proof` with no `sourceTxHash` and not terminal: nothing has been sent. Never for a shield (its `build-proof` is wallet prompts a cancel can't withdraw) and never from `submit-relayer` on (the relay POST may already be on its way). |
| `outcome.ts` | `txOutcome(record)` — the outcome bucket (settled / pending / failed / cancelled / unknown) from execution state + error code; indeterminate codes (timeout, dismissed, duplicate, stuck), `expired`, and an `RPC_ERROR` once the tx was being sent (not `failedBeforeSending(record)`: still in `build-proof` with no hash — the relayer may have broadcast before the error reached us) are `unknown`, never failed. Used by the activity list (`deriveActivityStatus`), the receipt, and `lib/fees/txFigures::moneyMoved`. |
| `errorCopy.ts` | `TX_ERROR_COPY` + `resolveTxErrorCopy(error, fallback, { userPaidNetworkFee })` — category-aware failed/cancelled copy shared by the live `ErrorStep` modal + the `ActivityReceipt`. `userPaidNetworkFee(record)` (direct-path shield / cross-chain shield) makes a `TX_REVERTED` body say the network fee was spent instead of "No funds were moved" (true only when the relayer paid the gas). `fundsNote(record)` — passed as `resolveTxErrorCopy`'s `fundsNote` option, which ends the body with it — says where the USDC is after a failure: "still in your private balance" (spends), "still in your wallet on {chain}" (shields), "Your vault position is unchanged." (vault withdrawal), "Your private balance is unchanged." (merge). Only from evidence that nothing moved: a failed or cancelled outcome (never unknown), no cross-chain source burn (`lib/fees/txFigures::moneyMoved`), and either the tx failed before sending (`failedBeforeSending(record)`, from `outcome.ts`, re-exported here) or its code proves nothing went out (`PRE_FLIGHT_REVERT` / `FEE_EXPIRED` / `USER_REJECTED` / `CANCELLED`, or a mined `TX_REVERTED`); null otherwise — no recorded hash is not proof, since a relayer request can time out after the relayer broadcast. `RPC_ERROR` reads "…while sending your transaction, so it may or may not have gone through. Check your balance before trying again." unless the `failedBeforeSending` option says it failed before anything was sent. The indeterminate codes (`POLL_TIMEOUT` / `STUCK` / `DISMISSED` / `DUPLICATE_TX`) end "Check your balance before starting a new transaction.", and `retryActionLabel(error)` labels an in-place retry that only re-checks a lost-track tx "Check again" (it never resends; an `RPC_ERROR` counts only when it carries the broadcast hash — without one the retry sends again) instead of "Try again" — used by every flow's error step (Send, Earn, Shield, Unshield). |
| `failureReport.ts` | `reportTerminalFailure(record)` — called once from the executor when a record settles `failed`. Always emits `tx.failed`; forwards the unexpected-failure codes (`OTHER` / `TX_REVERTED` / `POLL_TIMEOUT`) to Sentry via `trackError`, plus any failure whose `sdkCode` (the `@armada/sdk` error it was classified from) signals a bug or a broken prover (`PROOF_VERIFICATION` / `ARTIFACT_INTEGRITY` / `PROVER_WORKER`). |

## Invariants

- **`TxRecord` is the only persistent representation of a transaction.** No parallel storage. No optimistic balance mutation: records never change a balance, and balance atoms change only on a balance refresh. The one read-time view over in-flight state is the dashboard headline's projection (`projectedBalance.ts`, spec G-12) — a held spend's recorded change and an unscanned shield's note, added to the scanned balance while the SDK says they're still in flight.
- **Stages are append-only.** A record never moves "backwards" through stages — failures and retries re-enter the same stage; non-retryable failures terminate and a new record (new ulid) is required to retry from scratch.
- **`reducer.ts` is pure.** No IDB writes, no React. Hooks / executor call the reducer, then write the result via `state/tx.ts::upsertTxAtom` + `storage::putTxIfFresh`.
- **`updatedSeq` enforces optimistic concurrency.** Every transition increments it; `putTxIfFresh` and `upsertTxAtom` reject stale writes. This guards against duplicate-tab writes, poller races, and crash recovery anomalies.
- **`id` is a ulid generated client-side at submit.** Idempotency key: re-submitting with the same id is a no-op upsert (executor's reentrancy guard).
- **`walletContext` is captured at submit and immutable.** History filtering + debugging rely on stable identity even if the user later switches EVM or shielded wallets.

## Adding a new `TxKind`

1. Extend the `TxKind` union in `types.ts`.
2. Add a `Stage<NewKind>` union + extend `StageFor<K>`.
3. Add a `Meta<NewKind>` interface + extend `MetaFor<K>`.
4. (If cross-chain) extend `ArtifactsFor<K>` or reuse `ArtifactsXchain`.
5. Add a `TxLifecycle<NewKind>` entry in `lifecycles.ts` with `maxDurationMs` + `retryableStages` (and `stageEstimates` for any long wait, measured on the Debug page's Tx timings).
6. Register a `StageHandler<NewKind>` somewhere that gets imported on app load (typically a `features/<area>/handler.ts` module that side-effects `registerHandler(...)`).
7. Add the kind's copy to `components/tx/stageCopy.ts` (`KIND_TITLES`), `components/tx/processing/processingView.ts` (`STAGE_COPY`, `resolveCardBase`) and `components/tx/noticeCopy.ts` (`COPY`). These are exhaustive over `TxKind`, so the compiler flags a missing entry.

That's it. The reducer, storage, executor, and pollers handle any kind that conforms to the type contract.

## Executor

The executor lives at **module scope** in `executor.ts`. React doesn't own it. Hooks dispatch `executeTx(id)` / `cancelTx(id)`; the engine runs the handler chain in a fire-and-forget Promise.

Key behaviour:

- **Single-leader via `navigator.locks`.** On `startEngine()` the engine requests an exclusive lock named `armada-tx-executor` with `ifAvailable: true`. The holder runs handlers; other tabs are passive observers (atoms still hydrate from IDB, but `executeTx` is a no-op). When the leader tab closes, the lock releases and a follower tab can take over on next start. Because the SDK allows only one tab per origin anyway, a tab that doesn't get the lock sets `anotherTabActiveAtom`, so it shows the `SingleTabGate` at boot — before the user is asked to sign.
- **Visibility-gated.** Even on the leader, when the tab is hidden (`tabVisibleAtom = false`) the handler chain pauses. Resumes on visibility change.
- **Resume on unlock (leader only).** `resumeForWallet(walletId)` runs from `useTxResume` once the active wallet unlocks — NOT from `startEngine` (the leader lock is acquired pre-unlock, when there's no decryption key and `loadAllTx` returns `[]`). It reads non-terminal records from IDB and, per record: past the per-kind budget → `expired`; has a `sourceTxHash` (already broadcast) → `executeTx` re-attaches the watcher (safe because submit stages are idempotent — WS1.3); otherwise (no hash, never reached the wire) → `failed` with `INTERRUPTED` ("nothing was sent"). Idempotent per (walletId, session). Resume never re-broadcasts and never re-prompts the wallet on load.
- **AbortController per running tx.** `cancelTx(id)` aborts the controller; the handler must check `ctx.signal` and propagate. Stage handlers wire `ctx.signal` into their pollers.
- **No-progress backstop (#4).** Per the handler contract, `run()` must advance the stage, park at `waiting`, or terminate — every transition written via `ctx.upsert` (which bumps `updatedSeq`). If `run()` returns having written **nothing** (same stage AND same `updatedSeq`) while non-terminal + non-`waiting`, the chain loop would re-call it forever (a busy-loop until the lifecycle budget). The loop detects this and fails the record `STUCK` (indeterminate — the tx may have completed) + emits `tx.executor.no-progress`. The reachable trigger was a resume landing on a cross-chain handler's *collapsed* delivery stage (`iris-attestation-ready` / `*-mint-pending`) that had no `switch` case; those cases now re-enter `runWaitForDelivery` (idempotent re-poll → terminal), and the backstop guards any future handler with the same gap.

### Stage naming caveat — `'submit-relayer'` is a framework label

The `'submit-relayer'` stage exists in every kind's lifecycle (`shield`, `unshield-local`, `transfer-shielded`, `yield-deposit`, `yield-withdraw`, `consolidate`, `unshield-xchain`, `shield-xchain`). Every handler calls `lib/relayer.ts::submitRelay` (POST `/relay`) and then polls `/status` via `poller.ts::pollRelayStatusOnce`. The exceptions are `shield`'s direct path (`writeContract(PrivacyPool.shield)` from the user's wallet, after an approve if needed) and `shield-xchain`'s source-chain step, which also uses the user's wallet. The stage name is a stable framework label for "tx-on-the-wire", not a guarantee of who sends it.

This matters when scoping work like fee display, ETA estimation, or stage copy. The per-kind handler is the source of truth for submission shape.

### Stage handler contract

```ts
interface StageHandler<K extends TxKind> {
  kind: K
  run(record: TxRecord<K>, ctx: ExecutorCtx<K>): Promise<void>
  resumableFrom: ReadonlyArray<StageFor<K>>
}
```

- `run` executes the **current** stage. It writes transitions via `ctx.upsert(nextRecord)`.
- `run` returns when the stage is done (next stage advanced) OR the record is in `'waiting'` (chain pauses).
- `run` MUST honour `ctx.signal`. Throwing on abort is fine.
- `resumableFrom` lists stages this handler can safely re-enter on app reload — typically the same as `lifecycle.retryableStages`. The executor does not currently read it: resume decides by `sourceTxHash` presence (see "Resume on unlock" above).

### Outer try/catch contract

Every handler's `async run` wraps its switch/dispatch in `try { ... } catch (err) { ... }`. The catch MUST follow this shape so cancel + dismiss work correctly:

```ts
} catch (err) {
  // 1. If the signal aborted, abortAndMark (cancel/dismiss) already wrote the terminal state.
  //    Returning here without upserting prevents us from clobbering the cancelled/dismissed
  //    record with a failed one. OCC would silently drop the write anyway — explicit return
  //    is clearer about intent and avoids a misleading telemetry event.
  if (ctx.signal.aborted) return
  // 2. Otherwise classify the thrown value into a typed TxError and write it via markFailed.
  //    classifyHandlerError preserves branded TxErrors (POLL_TIMEOUT / TX_REVERTED from inner
  //    helpers like waitForReceiptOrFail) so the category isn't lost in the outer catch.
  const failed = markFailed(record, classifyHandlerError(err, '<kind> failed.', record.artifacts.sourceTxHash))
  await ctx.upsert(failed)
}
```

The abort-check-before-markFailed pattern is invariant across every handler. If you add a new handler, copy the shape rather than improvising.

## Polling adapters

`poller.ts` exports a generic `poll(pollOnce, opts)`. Stage-specific adapters (one per polling type) call into `lib/cctp.ts`, `lib/relayer.ts`, or RPC directly (bounded windows — see the root `eth_getLogs` rule). Convention: the adapter function is named `poll<Source>Once(...)` (e.g. `pollRelayStatusOnce`) and returns `Promise<T | null>` — null means "no result yet, keep polling".

## Resume policy

Resume runs from `useTxResume` (hooks/) when the active wallet unlocks — leader-gated and
idempotent per (walletId, session) via a module-scope `Set`. It calls `resumeForWallet(walletId)`,
which reads non-terminal records straight from IDB (`loadAllTx(walletId)`) rather than `txListAtom`
(hydration races leader-lock acquisition; `upsertTxAtom` is OCC-safe so seeding here can't regress
newer state). Per non-terminal record:

- past `lifecycle.maxDurationMs` (wall-clock from `createdAt`) → `markExpired`.
- has `artifacts.sourceTxHash` (the tx is already on chain) → `executeTx(record.id)` to re-attach
  the watcher (receipt / relayer status / cross-chain delivery polling). Safe because every submit
  stage is idempotent (WS1.3) — a re-entry with a known hash never re-broadcasts.
- otherwise (no hash — interrupted at `build-proof`, or at `submit-relayer` before the tx hit the
  wire) → `markFailed` with `INTERRUPTED`. Resuming would re-prompt the wallet / re-POST out of
  nowhere, so we fail honestly: "nothing was sent — start a new transaction."

Resume thus only ever RE-WATCHES an already-broadcast tx; it never submits and never re-prompts on
load. `maxDurationMs` is per-kind: 10 min same-chain (`shield`, `unshield-local`,
`transfer-shielded`), 15 min yield and `consolidate` (up to 4 serial proofs), 60 min xchain. (`StageHandler.resumableFrom` is currently
unread — the has-hash test supersedes it; see WS7 docs cleanup.)

## Terminal-write guard

`upsertTxAtom` (state/tx.ts) and `putTxIfFresh` (storage.ts) refuse any write that would move a
record from a terminal state (`completed | failed | expired | cancelled`) to a non-terminal one,
*regardless of `updatedSeq`* — this stops a late poller / proof-progress write (which can carry a
higher seq from a stale in-flight reference) from resurrecting a cancelled/failed/expired record.
Two carve-outs: terminal→terminal is allowed (the history-recovery `expired|failed → completed`
upgrade path, WS1.7), and terminal→`retrying` is allowed (an intentional `retryTx`/`markRetrying`;
stale writes only ever produce `active`/`waiting`, never `retrying`).

## Telemetry conventions

The tx executor emits structured events via `lib/telemetry.ts`. The EventRegistry's `tx.*` keys are the only allowlist; adding a new event = editing the registry.

**Stage changes:** every handler write through `ctx.upsert` that moves a record to a new stage emits `tx.transition` (`from` → `to`) with `durationMs`, the time spent in `from` (from the record's `stageEnteredAt` stamps; omitted when `from` has none).

Never emit amounts, recipients, or anything tied to shielded identities. Use ids and kinds.

**Failure reporting is single-chokepoint.** When a handler leaves a record `failed` — via its outer catch OR an inner post-broadcast failure (`POLL_TIMEOUT` / `TX_REVERTED`) that upserts-and-returns without re-throwing — the executor's chain loop calls `failureReport.ts::reportTerminalFailure(record)` exactly once. That emits the `tx.failed` info event for every failure and funnels the unexpected codes (and the SDK codes that mean a bug or a broken prover, via `TxError.sdkCode`) to Sentry, so handlers don't call `trackError` themselves and a new handler gets both for free. `STUCK` (executor no-progress → `tx.executor.no-progress`) and `INTERRUPTED` (resume → `tx.interrupted`) carry their own dedicated telemetry and are intentionally not routed through this chokepoint.
