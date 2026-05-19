# lib/tx/

Transaction lifecycle model. The most important architectural surface in this app — read `.claude/PLAN_ARMADA_INTERFACE.md` §7 + §7a before touching.

## Files

| File | Purpose |
|---|---|
| `types.ts` | `TxKind` discriminated union; per-kind stage unions; `TxRecord<K>` with `executionState` + `stage` + `updatedSeq` + `walletContext`; `TxLifecycle<K>` with `maxDurationMs` + `retry`. |
| `lifecycles.ts` | One `TxLifecycle` per `TxKind` — stage sequence, terminal-success stage, retryable stages, per-kind expiry cap + retry policy. |
| `reducer.ts` | Pure transitions: `advance`, `markWaiting`, `markRetrying`, `markFailed`, `markExpired`, `markCancelled`, `shouldResume`. Every transition increments `updatedSeq`. |
| `storage.ts` | IDB persistence: `putTxIfFresh` (OCC enforced via `updatedSeq`), `putTx` (unconditional, hydration only), `loadAllTx`, `deleteTx`. |
| `executor.ts` | **Module-scope** execution engine. Runs stage handlers outside React, owns AbortControllers, leader-elected via `navigator.locks`. |
| `poller.ts` | Generic abortable / jittered / backoff-aware poll loop. Stage-specific adapters (Iris, RPC, relayer) plug in here. |

## Invariants

- **`TxRecord` is the only persistent representation of a transaction.** No parallel storage. No optimistic balance mutation. Balance changes come from the next balance refresh, NOT from in-flight tx state.
- **Stages are append-only.** A record never moves "backwards" through stages — failures and retries re-enter the same stage; non-retryable failures terminate and a new record (new ulid) is required to retry from scratch.
- **`reducer.ts` is pure.** No IDB writes, no React. Hooks / executor call the reducer, then write the result via `state/tx.ts::upsertTxAtom` + `storage::putTxIfFresh`.
- **`updatedSeq` enforces optimistic concurrency.** Every transition increments it; `putTxIfFresh` and `upsertTxAtom` reject stale writes. This guards against duplicate-tab writes, poller races, and crash recovery anomalies.
- **`id` is a ulid generated client-side at submit.** Idempotency key: re-submitting with the same id is a no-op upsert (executor's reentrancy guard).
- **`walletContext` is captured at submit and immutable.** History filtering + debugging rely on stable identity even if the user later switches EVM or Railgun wallets.

## Adding a new `TxKind`

1. Extend the `TxKind` union in `types.ts`.
2. Add a `Stage<NewKind>` union + extend `StageFor<K>`.
3. Add a `Meta<NewKind>` interface + extend `MetaFor<K>`.
4. (If cross-chain) extend `ArtifactsFor<K>` or reuse `ArtifactsXchain`.
5. Add a `TxLifecycle<NewKind>` entry in `lifecycles.ts` with `maxDurationMs` + `retry`.
6. Register a `StageHandler<NewKind>` somewhere that gets imported on app load (typically a `features/<area>/handler.ts` module that side-effects `registerHandler(...)`).
7. Optionally: custom rendering in `components/tx/<NewKind>/`. The default stepper handles it if you skip.

That's it. The reducer, storage, executor, and pollers handle any kind that conforms to the type contract.

## Executor

The executor lives at **module scope** in `executor.ts`. React doesn't own it. Hooks dispatch `executeTx(id)` / `cancelTx(id)`; the engine runs the handler chain in a fire-and-forget Promise.

Key behaviour:

- **Single-leader via `navigator.locks`.** On `startEngine()` the engine requests an exclusive lock named `armada-tx-executor` with `ifAvailable: true`. The holder runs handlers; other tabs are passive observers (atoms still hydrate from IDB, but `executeTx` is a no-op). When the leader tab closes, the lock releases and a follower tab can take over on next start.
- **Visibility-gated.** Even on the leader, when the tab is hidden (`tabVisibleAtom = false`) the handler chain pauses. Resumes on visibility change.
- **Resume on cold load.** `startEngine()` walks `txListAtom`, finds non-terminal records, calls `shouldResume(record)` (per-kind expiry cap). Either resumes (calls `executeTx(record.id)`) or marks `expired`.
- **AbortController per running tx.** `cancelTx(id)` aborts the controller; the handler must check `ctx.signal` and propagate. Stage handlers wire `ctx.signal` into their pollers.

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
- `resumableFrom` lists stages this handler can safely re-enter on app reload — typically the same as `lifecycle.retryableStages`.

## Polling adapters

`poller.ts` exports a generic `poll(pollOnce, opts)`. Stage-specific adapters (one per polling type) call into `lib/cctp.ts`, `lib/relayer.ts`, or RPC directly via `lib/events`. Convention: the adapter function is named `poll<Source>Once(...)` (e.g. `pollIrisOnce`, `pollReceiptOnce`) and returns `Promise<T | null>` — null means "no result yet, keep polling".

## Resume policy

On app load, `useTxHistory()` hydrates `txListAtom` from IDB. The executor (`resumeNonTerminal()`) walks the list:

- Terminal records (`completed | failed | expired | cancelled`) are left alone.
- Non-terminal AND `shouldResume(record)` (i.e. `now - createdAt < lifecycle.maxDurationMs`) → `executeTx(record.id)`.
- Otherwise → `markExpired` + persist + telemetry.

`maxDurationMs` is per-kind: 10 min for same-chain (`shield`, `unshield-local`, `transfer-shielded`), 15 min for yield ops, 60 min for xchain.

## Telemetry conventions

The tx executor emits structured events via `lib/telemetry.ts`. The EventRegistry's `tx.*` keys are the only allowlist; adding a new event = editing the registry.

Never emit amounts, recipients, or anything tied to shielded identities. Use ids and kinds.
