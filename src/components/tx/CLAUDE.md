# components/tx/

Transaction-rendering primitives. Each one consumes a `TxRecord` and renders something appropriate — no fetching, no executor calls. Hooks own data; these own visuals.

## Contents

| Component | Purpose |
|---|---|
| `TxLifecycleStepper` | Vertical stepper for any `TxKind`. Reads `lifecycleFor(record.kind)` + record state. Status chip + per-stage rows + ETA header (`lib/tx/eta.ts`) + proof % + technical-details disclosure. **Not rendered by any screen at present** — the in-flight UI is `processing/`. |
| `TxRow` | Compact row — title + amount + status + relative time, with an optional stage-copy sub-line + progress strip. V1 Phase 9 added the `transfer-shielded-received` kind: incoming privately-paid USDC rendered with the Inbox glyph + green inflow amount; synthesized from chain by useHistoryRecovery / useIncomingTransferDetector. A `consolidate` (merge notes) row uses the Combine glyph and shows its fee — it moves no value (`lib/fees/txFigures::txHeadline`). |
| `TxStatusChip` | Maps `TxExecutionState` → `StatusChip` variant + label. Consolidates pre-terminal states (`pending`/`active`/`waiting`/`retrying`) under a single "Pending" badge. |
| `TxActions` | Per-record CTAs: Retry (gated by the executor's `canRetryTx`), and Cancel (pre-broadcast, `cancelTx`) or Stop tracking (post-broadcast, `dismissTx`). Hidden on follower tabs. **Not rendered by any screen at present.** |
| `processing/` | The redesigned in-flight "processing" surface — `TxProgressCard` (tick-ring around the USDC logo) + `TransactionProgressDisclosure` timeline + `TxProcessingLayout`; view model in `processingView.ts` / copy in `processingCopy.ts`. Rendered by `flow/ProgressStep` off the live record. |
| `stageCopy.ts` | Pure helpers: `stageCopy(kind, stage, executionState?)`, `kindTitle(kind)`, `recordTitle(record)`. Row/stepper/activity copy; the in-flight view's copy is in `processing/processingView.ts`. |

## Conventions

- **No data fetching inside components.** A row or stepper takes a record via props; the caller (page or feature component) reads `txListAtom` / `pendingTxsAtom` and forwards.
- **No business logic.** If you find yourself deriving lifecycle math (e.g. ETA-from-history) inside a render, push it into `lib/tx/` or a hook.
- **Copy lives in two maps, never inline in a component.** `stageCopy.ts` (`COPY`, `KIND_TITLES`) serves `TxRow`, `TxLifecycleStepper`, and the dashboard activity adapter. `processing/processingView.ts` (`STAGE_COPY`, `GROUP_COPY`, `resolveCardBase`) serves the live in-flight view. Adding a stage means editing both.
- **Explorer links via `getChainById(chainId).explorerUrl`.** Don't hardcode hostnames.
- **Don't expose raw stage strings in the primary UX.** They're allowed inside `TechnicalDetailsDisclosure` for debugging, never in the row title or stepper-row label.

## When `TxLifecycleStepper`'s assumptions break

The stepper trusts `record.stage` and `record.stagesCompleted` to be consistent with `lifecycleFor(record.kind).stages`. If they aren't, rows show "pending" by default (no row marked done/current). That's a bug in whichever code produced the record — fix it there, not here.

## Wallet-signing copy (shield only)

`shield`'s `submit-relayer` stage has two subtitle variants in `processing/processingView.ts` — `waiting` ("Confirm in your wallet", direct-submit path) and `active` ("Submitting to the relayer", gasless path). Only the current row uses `executionState`; done/pending rows use the `active` copy. `stageCopy.ts` carries the equivalent split for `TxRow` / the stepper (there `shield-xchain`'s submit stage is split too). Other kinds use static copy; add a variant in both maps if a kind grows the need. The shield flow's wallet prompts themselves are shown on the dedicated wallet step (`shield/ShieldWalletStep`), before the progress view.
