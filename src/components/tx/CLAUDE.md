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
| `DeliveryTxLink/` | "View delivery on {chain} ↗" — the explorer link to a cross-chain tx's destination (CCTP mint) tx, from `lib/explorer::deliveryExplorerLink` (`artifacts.destTxHash` on the unshield's `toChainId`, or the hub for a cross-chain shield). Under the summary on the Send / Shield / Unshield confirmation and the Activity receipt; renders nothing until the mint hash is known. |
| `PendingTxPill/` | The header's pending pill beside the wallet button (spinner + the one in-flight tx by name, "Shielding 5.00 USDC…", from `hooks/usePendingTxLabel` — or "N Pending" when several are; surface-main like the other header controls); hidden at zero. In the "pill" notice style it also announces a tx notice in place of the count (`announcement`, from `txNoticeAnnouncementAtom`) — even once nothing is pending; a failure / unknown outcome stays up with "View details" and a dismiss. Motion (`usePillMotion`, component-local, DOM-only): it unfolds from a transparent 40px circle when it appears (width and opacity in one transition, icon and text together), eases its width and crossfades between states (right edge pinned to the wallet pill, so it grows leftward), and folds back to 40px while fading out when there's nothing to show; instant under reduced motion. Its width is the content's layout width (`offsetWidth` / ResizeObserver border box), never the transformed on-screen box. Dumb otherwise: `AppLayout` passes the count (`pendingTxsAtom`), the announcement and what a click opens (`hooks/useOpenTxActivity`). |
| `TxNoticeToast/` | A tx notice as a floating toast (rendered via sonner's `toast.custom`, one per record id so a later notice replaces it): `TxNoticeIcon` + title + "View" ("View details" for a failure / unknown outcome, `noticeNeedsAttention`) → the receipt. Layout only — the card is the `ui/AppToaster` toast container, as for every toast. |
| `TxNoticeIcon/` | The tone glyph shared by the toast and the pill: spinner (pending), check (success), arrow (received), cross (failure), warning (uncertain). |
| `noticeCopy.ts` | `txNoticeTitle(record, tone, { hideAmounts, ownEvmAddress })` — the one-line title of a tx notice (header pill / toast): "Shielding 5.00 USDC…", "Sent 5.00 USDC", "Shield failed", "Couldn't confirm the send", "Received 5.00 USDC". An unshield to the user's own wallet reads "Unshielded"; hidden balances drop the amount ("Received USDC"). |
| `stageCopy.ts` | Pure helpers: `stageCopy(kind, stage, executionState?)`, `kindTitle(kind)`, `recordTitle(record)`. Row/stepper/activity copy; the in-flight view's copy is in `processing/processingView.ts`. |

## Conventions

- **No data fetching inside components.** A row or stepper takes a record via props; the caller (page or feature component) reads `txListAtom` / `pendingTxsAtom` and forwards.
- **No business logic.** If you find yourself deriving lifecycle math (e.g. ETA-from-history) inside a render, push it into `lib/tx/` or a hook.
- **Copy lives in maps, never inline in a component.** `stageCopy.ts` (`COPY`, `KIND_TITLES`) serves `TxRow`, `TxLifecycleStepper`, and the dashboard activity adapter. `processing/processingView.ts` (`STAGE_COPY`, `GROUP_COPY`, `resolveCardBase`) serves the live in-flight view. Adding a stage means editing both. `noticeCopy.ts` (`COPY`, per kind, not per stage) serves the tx notices outside the modal.
- **Explorer links via `getChainById(chainId).explorerUrl`.** Don't hardcode hostnames.
- **Don't expose raw stage strings in the primary UX.** They're allowed inside `TechnicalDetailsDisclosure` for debugging, never in the row title or stepper-row label.

## When `TxLifecycleStepper`'s assumptions break

The stepper trusts `record.stage` and `record.stagesCompleted` to be consistent with `lifecycleFor(record.kind).stages`. If they aren't, rows show "pending" by default (no row marked done/current). That's a bug in whichever code produced the record — fix it there, not here.

## Wallet-signing copy (shield only)

`shield`'s `submit-relayer` stage has two subtitle variants in `processing/processingView.ts` — `waiting` ("Confirm in your wallet", direct-submit path) and `active` ("Submitting to the relayer", gasless path). Only the current row uses `executionState`; done/pending rows use the `active` copy. `stageCopy.ts` carries the equivalent split for `TxRow` / the stepper (there `shield-xchain`'s submit stage is split too). Other kinds use static copy; add a variant in both maps if a kind grows the need. The shield flow's wallet prompts themselves are shown on the dedicated wallet step (`shield/ShieldWalletStep`), before the progress view.
