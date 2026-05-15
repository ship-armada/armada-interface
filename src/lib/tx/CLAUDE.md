# lib/tx/

Transaction lifecycle model. The most important architectural surface in this app — read PLAN_ARMADA_INTERFACE.md §7 before touching.

## Files

| File | Purpose |
|---|---|
| `types.ts` | `TxKind` discriminated union; per-kind stage unions; `TxRecord<K>`, `MetaFor<K>`, `ArtifactsFor<K>`; lifecycle type. |
| `lifecycles.ts` | One `TxLifecycle` per `TxKind` — stage sequence, terminal-success stage, retryable stages, ETA hints. |
| `reducer.ts` | Pure transitions: `advance(record, toStage, artifactPatch)`, `markFailed`, `markExpired`, `shouldResume`. |
| `storage.ts` | IDB persistence: `putTx`, `loadAllTx`, `deleteTx`. |
| `poller.ts` | Generic abortable / jittered / backoff-aware poll loop. Stage-specific adapters (Iris, RPC, relayer) plug in here. |

## Invariants

- **`TxRecord` is the only persistent representation of a transaction.** No parallel storage. No optimistic balance mutation. Balance changes come from the next balance refresh, NOT from in-flight tx state.
- **Stages are append-only.** A record never moves "backwards" through stages — failures and retries create a new record (with a new ulid) when the prior is non-retryable.
- **`reducer.ts` is pure.** No IDB writes, no React. Hooks call the reducer, then write the result to both `txListAtom` and `storage.putTx`.
- **`id` is a ulid generated client-side at submit.** Used for idempotency: if a hook re-submits with the same id, we update in place rather than creating a duplicate.

## Adding a new `TxKind`

1. Extend the `TxKind` union in `types.ts`.
2. Add a `Stage<NewKind>` union + extend `StageFor<K>`.
3. Add a `Meta<NewKind>` interface + extend `MetaFor<K>`.
4. (If cross-chain) extend `ArtifactsFor<K>` or reuse `ArtifactsXchain`.
5. Add a `TxLifecycle<NewKind>` entry in `lifecycles.ts`.
6. Optionally: custom rendering in `components/tx/<NewKind>/`. If none, the default stepper handles it.

That's it. The reducer, storage, and pollers handle any kind that conforms to the type contract.

## Polling adapters

`poller.ts` exports a generic `poll(pollOnce, opts)`. Stage-specific adapters (one per polling type) call into `lib/cctp.ts`, `lib/relayer.ts`, or RPC directly. Convention: the adapter function is named `poll<Source>Once(...)` (e.g. `pollIrisOnce`, `pollReceiptOnce`) and returns `Promise<T | null>` — null means "no result yet, keep polling".

## Resume policy

On app load, `useTxHistory()` hydrates `txListAtom` from IDB. For each non-terminal record:
- `Date.now() - record.updatedAt < 30 min` → resume polling for the current stage.
- Older → mark `expired`, show a retry button in the History page.

The 30-minute threshold matches the typical Iris attestation timeout. Adjust in `reducer.ts::shouldResume`.
