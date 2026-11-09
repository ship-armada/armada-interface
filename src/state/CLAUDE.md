# state/

Jotai atoms. **Read-mostly from components.** Write paths go through hooks or `set(upsertTxAtom)`.

| File | Atoms |
|---|---|
| `tx.ts` | `txListAtom` (root, all wallets) + `activeTxListAtom` (V2 Phase 6: filtered to `activeShieldedWalletIdAtom`) + `pendingTxsAtom` (sources from `activeTxListAtom`), `txByIdAtom(id)`, `upsertTxAtom` (write-only), `txHistoryHydratedAtom` (the wallet id whose stored records `useTxHistory` has loaded; the tx-notice watcher's baseline). UI surfaces (the dashboard activity list + "all activity" panel) MUST read `activeTxListAtom` so wallet switches can't leak prior history. |
| `wallet.ts` | `evmAddressAtom`, `shieldedWalletAtom`, `usdcBalancesAtom`, `shieldedUsdcAtom` (spendable + pending) / `shieldedUsdcSpendableAtom`, `yieldSharesAtom`, `heldSpendTxidsAtom` (the spends the SDK still holds, read with the balances) / `scannedThroughAtom` (the block the SDK's scan has reached) — the projection's inputs, `syncStateAtom`, `syncRetryEpochAtom` (bumped by `useSyncRetry` to re-run the initial scan; past 0, the failed sync UI adds a hint + "Get help"), `restoredWalletAwaitingBalanceAtom` (a just-restored wallet whose balance isn't known yet → `useRestoreSyncedToast`) |
| `fees.ts` | `feeQuoteAtom`, `feeQuoteIsStaleAtom` (derived) |
| `visibility.ts` | `tabVisibleAtom` (updated only by `useTabVisible()` — single listener) |
| `ui.ts` | `openModalAtom`, `balanceHiddenAtom`, `activityPanelOpenAtom` / `receiptTxIdAtom` (the Dashboard's "All activity" panel and open receipt — app-level so the pending pill and tx notices can open them), `paymentIntentAtom` (pay-via-link → Send prefill hand-off), `repeatIntentAtom` (an Activity receipt's "do it again" → the Send / Shield / Unshield / Earn modal's amount-step prefill, consumed on open), `mergeIntentAtom` (what the `merge` modal opens with: the token + the blocked spend it should unblock), `signInResumeAtom` (the flow to open once sign-in or a restore finishes), `signInAwaitingConnectAtom` (a gated action is waiting on the connect modal), `signInStatusAtom` (the sign-in card's attempt: `submitting` / `error`, from `useSignIn`), `restoreEntryAtom` (what the `restore` modal opens on: the restore form or the compatibility screen with its reason; `'restore'` is a `ModalKind` but not an `ActionModalKind`), `lockReasonAtom` (`'idle' \| 'hidden' \| 'manual'` — why the wallet last locked, for the sign-in card; cleared on unlock) |
| `txNotices.ts` | `txInViewIdsAtom` (records on screen — a flow modal showing its tx via `useTx({ inView })`, or the open receipt — which raise no notice) + `txNoticeFeedAtom` (the notices `useTxNotices` raised, `{ seq, tone, record }`, oldest first, capped; cleared on lock; seq numbers on from the last item) + `txNoticeStyleAtom` (read/write view of the `preferencesAtom.txNoticeStyle` user preference — Settings → "Show transaction updates": `toast` (default, also when an older saved preference lacks it) / `pill`) + `txNoticeAnnouncementAtom` (what the header pill is announcing in the pill style, set by `useTxNoticePresenter`). |
| `balanceProjection.ts` | The dashboard's projected balance (3B, spec G-12): `balanceProjectionAtom` (`lib/tx/projectedBalance` over the active records, `heldSpendTxidsAtom` and `scannedThroughAtom`), the derived `shieldedUsdcHeadlineAtom` / `yieldSharesHeadlineAtom` (scanned + projected; null until the first sync — dashboard-only, Max and guards read the scanned atoms) and `balanceConfirmingAtom` (the card's "Confirming…"). |
| `txTimings.ts` | `balanceLatencySamplesAtom` — this session's completion → balance-change samples (`{ kind, durationMs }`, from `useBalanceLatencyProbe`), read by the Debug page's Tx timings; `signInLatencySamplesAtom` — sign-in → first balance (`{ cold, durationMs }`, from `useSignInBalanceProbe`). Not persisted. |
| `history.ts` | `historyRecoveryAtom` (`{ state: 'idle'\|'scanning'\|'failed', error?, lastRecordCount? }`) + `historyRecoveryTriggerAtom` (`{ id, silent }` — bump `id` to re-scan; `silent: true` from the detector stays `idle`, `false` from Settings/Retry/Clear-history reads `scanning`, as does the sign-in recovery). Read by Settings (Re-scan button), the Dashboard (the vault's Earned figure waits for `idle`) and `HistoryRecoveryBanner` (only `failed` → Retry; no strip while scanning). |
| `time.ts` | `nowAtom` — Date.now() snapshot driven by `useNowTicker` (~once a minute). Consumed by the fee-quote staleness check (`fees.ts`). |
| `requestLinks.ts` | `requestLinksAtom` (created payment-request links for the active wallet, hydrated by `useRequestLinks` from the encrypted per-wallet store) + `requestShareIntentAtom` (re-open the Request flow at the Share step from an activity row). |

## Conventions

- **Atoms own no logic.** They expose data. Logic lives in hooks (which write atoms) and `lib/` (which produces values).
- **Derived atoms compose with `atom((get) => ...)`** so memoization is automatic. Don't add `useMemo` on top of `useAtomValue(derivedAtom)` — it's redundant.
- **Atom names end in `Atom`.** Match crowdfund-shared's convention.
- **Selector-style atoms (e.g. `txByIdAtom(id)`) return a NEW atom per call** — wrap with `useMemo` at the call site to avoid re-subscribing every render. Pattern:
  ```ts
  const record = useAtomValue(useMemo(() => txByIdAtom(id), [id]))
  ```
- **Never persist directly from a setter.** Atoms are runtime state. Persistence (IDB) is the hook's job — write to the atom AND `lib/.../storage.ts` in the same callback.
