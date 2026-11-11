# components/flow/

`FlowShell` + its supporting primitives — the shared chrome that wraps every modal flow (Shield / Send / Withdraw / Earn / Request / the activity receipt) in the app.

## Current contents

| Primitive | Purpose |
|---|---|
| `FlowShell` | **The live modal chrome.** Wraps the vendored `FlowModalOverlay + ModalShell + ModalStepSwitch` from `@/design` — logo + Steps progress + close + backdrop/focus-trap. Every feature modal renders this. Props: `open`, `onClose`, `flowLabel`, `steps`, `currentStep`, `status`, `hideSteps`, `exiting`, `stepKey`. |
| `useFlowExit` | Close hook — plays `FlowShell`'s slide-down before running the real `onClose` (holds `exiting` for `MODAL_EXIT_TOTAL_MS`; closes synchronously under reduced motion). Each modal wires `const { exiting, requestClose: close } = useFlowExit(() => setOpenModal(null))` and passes `exiting` to `FlowShell`; the atom stays set until the animation ends so the step content stays frozen. |
| `ProgressStep` | In-flight progress UI for any TxKind — calls `buildProcessingView(record)` and renders `components/tx/processing/TxProcessingLayout` off the live record: the ring (filled to the proof's real progress while one builds), the timeline, the timing note, and `tx/TxCancelButton` while the proof is still building. Each flow sends a `cancelled` record back to its Review step. |
| `ErrorStep` | Icon + headline + message + Try Again (disabled when `onRetry` omitted; flows pass "Check again" for a lost-track tx via `lib/tx/errorCopy::retryActionLabel`, "Start over" when not retryable in place) + optional View Details. Copy comes from `lib/tx/errorCopy.ts` (shared with the ActivityReceipt). `userPaidNetworkFee` (set by `ShieldModal` for the direct path) makes a reverted tx say the network fee was spent. `fundsNote` (every flow passes `lib/tx/errorCopy::fundsNote(record)`) ends the body with where the USDC is — "Your USDC is still in your private balance." — only when that's certain; `failedBeforeSending` (every flow passes `errorCopy::failedBeforeSending(record)`) lets a network error say nothing was sent. Under the copy, a plain "Get help on Discord" link (`config/support::SUPPORT_URL`, nothing prefilled). An optional `remedy` (an in-app fix, e.g. "Merge notes" from `useMergeNotes().remedyFor(record)`) becomes the primary button and moves Try Again / Start over to the secondary slot. |
| `FeeUpdatedBanner` | Warning-toned Review-step callout shown when a submit-time fee refetch changed the fee (`lib/tx/submitQuote.ts`). Each review step (`ShieldReviewStep` / `SendReviewStep` / `EarnReviewStep`) renders it when its flow reports `feeChanged`, so the user re-confirms the new amount instead of it silently swapping. |
| `HighFeeNotice` | Review's high-fee warning (5D), in the warning-callout style: "High fees for this amount — Fees are N% of this amount" when every fee the user loses (relayer + protocol + CCTP) is over 10% of it (`lib/fees/highFee`), plus an "I understand the fees are more than a quarter of this amount" tick over 25% that the Review step holds Confirm for (`hooks/useHighFeeAck`; the tick resets when the fee or amount changes). On the Send / Unshield (`SendReviewStep`), Shield and Earn Reviews; not Merge (no amount). |
| `WalletConfirmList` | Per-step "confirm in your wallet" checklist (shield signing sub-state): spinner for a row whose prompt is open (`loading`) or that's confirming on chain (`confirming`), with that detail under its label. |
| `overlayFlow.ts` | The flow step types (`FlowStep`, `FlowVisibleStep`, `FlowStepIndicatorStatus`) and `overlayIndicatorStep` / `overlayIndicatorStatus` — map a step string → the ModalShell Steps indicator position + status (default/confirmed/error). Used by the feature modals. `showsSubmittedTx(step)` — true on progress / complete / error, the steps that show the submitted tx; every flow passes `isOpen && showsSubmittedTx(step)` as `useTx`'s `inView`. |

### FlowFooter

`FlowFooter` (primary CTA right, optional secondary left) is live in the non-flow dialogs: `ErrorStep`, the settings dialogs (`ResetWalletDialog`, `RecoverySecretExportDialog`, `ClearHistoryDialog`) and `onboarding/RestoreFlow` (inside `RestoreModal`) render it. Feature flow steps don't — they render their own button row (below).

## FlowShell motion

`FlowShell` threads two motion props: `exiting` (drives the overlay/shell slide-down — set via `useFlowExit`) and `stepKey` (when it changes, the vendored `ModalStepSwitch` plays a short content exit then remounts the next step so its enter animations replay). Pass the modal's `step` string as `stepKey`; omit it for static shells (e.g. the activity receipt). Step bodies apply `modalStepBodyEnter` (body slides in) + `modalActionRowEnter` (buttons bounce in, staggered) from `@/design` so each step transition animates.

## Conventions

- Same as `components/ui/CLAUDE.md`: folder per primitive, ABOUTME header, CSS Module referencing `var(--semantic-*)` tokens, no Tailwind typography, no `clsx`/`cva`.
- Footer composition: each feature step renders its **own** button row (plain `@/design` `Button`s in a `flowButtonRow.module.css` `.buttonRow`, tagged `modalActionRowEnter`) inside its body. `FlowShell` owns only chrome, not footer content.
- Step labels + active tick come from `FlowShell`'s `steps` + `currentStep` props (backed by `ModalShell`); the modal derives `currentStep` from its step string (often via `overlayFlow.ts`).

## Step indicator semantics

`FlowShell` takes `steps` (labels) + a 1-based `currentStep` and renders the `ModalShell` Steps bar. The error step is **not** part of the indicator — it's an overlay that appears in place of whichever step failed, with a Try Again CTA that returns the user to that step. Don't include `error` in the visible step count.

## Wallet-signing step (shield)

`shield` is the only kind that surfaces a wallet signature, and it has a **dedicated `wallet` step** (the mockup's step 3) between `review` and `progress` — `components/shield/ShieldWalletStep`, rendering `WalletConfirmList` from `lib/tx/shieldWalletSteps` (live approve/sign statuses). `useShieldFlow` advances `wallet → progress` once `shieldWalletInteractionsComplete(record)`, so by the time `progress` shows, the wallet prompts are done (no duplicate "Confirm in your wallet" in the progress timeline). Other kinds (unshield/transfer/yield) have no wallet-sign step — they're relayer-submitted; their brief `executionState === 'waiting'` still shows in `ProgressStep`'s stage copy.
