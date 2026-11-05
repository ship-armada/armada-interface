# state/

Jotai atoms. **Read-mostly from components.** Write paths go through hooks or `set(upsertTxAtom)`.

| File | Atoms |
|---|---|
| `tx.ts` | `txListAtom` (root, all wallets) + `activeTxListAtom` (V2 Phase 6: filtered to `activeShieldedWalletIdAtom`) + `pendingTxsAtom` (sources from `activeTxListAtom`), `txByIdAtom(id)`, `txsForKindAtom(K)`, `txsForStatusAtom(s)`, `upsertTxAtom` (write-only), `txHistoryHydratedAtom` (the wallet id whose stored records `useTxHistory` has loaded; the tx-notice watcher's baseline). UI surfaces (the dashboard activity list + "all activity" panel) MUST read `activeTxListAtom` so wallet switches can't leak prior history. |
| `wallet.ts` | `evmAddressAtom`, `shieldedWalletAtom`, `usdcBalancesAtom`, `shieldedUsdcAtom` (spendable + pending) / `shieldedUsdcSpendableAtom`, `yieldSharesAtom`, `shieldedUsdcHeadlineAtom` / `yieldSharesHeadlineAtom` (dashboard-only: also count a broadcast spend's held inputs so the headline doesn't dip), `syncStateAtom`, `syncRetryEpochAtom` (bumped by `useSyncRetry` to re-run the initial scan) |
| `fees.ts` | `feeQuoteAtom`, `feeQuoteIsStaleAtom` (derived) |
| `visibility.ts` | `tabVisibleAtom` (updated only by `useTabVisible()` — single listener) |
| `ui.ts` | `openModalAtom`, `balanceHiddenAtom`, `activityPanelOpenAtom` / `receiptTxIdAtom` (the Dashboard's "All activity" panel and open receipt — app-level so the pending pill and tx notices can open them), `paymentIntentAtom` (pay-via-link → Send prefill hand-off), `mergeIntentAtom` (what the `merge` modal opens with: the token + the blocked spend it should unblock) |
| `txNotices.ts` | `txInViewIdsAtom` (records on screen — a flow modal showing its tx via `useTx({ inView })`, or the open receipt — which raise no notice) + `txNoticeFeedAtom` (the notices `useTxNotices` raised, `{ seq, tone, record }`, oldest first, capped; cleared on lock; seq numbers on from the last item) + `txNoticeStyleAtom` (read/write view of the `preferencesAtom.txNoticeStyle` user preference — Settings → "Show transaction updates": `toast` (default, also when an older saved preference lacks it) / `pill`) + `txNoticeAnnouncementAtom` (what the header pill is announcing in the pill style, set by `useTxNoticePresenter`). |
| `history.ts` | `historyRecoveryAtom` (`{ state: 'idle'\|'scanning'\|'failed', error?, lastRecordCount? }`) + `historyRecoveryTriggerAtom` (`{ id, silent }` — bump `id` to re-scan; `silent: true` from the detector runs without the banner, `false` from Settings/Retry/Clear-history shows it). Read by `HistoryRecoveryBanner` and the History page empty state. |
| `time.ts` | `nowAtom` — Date.now() snapshot driven by `useNowTicker`. Consumed by relative-time labels (TxRow). |
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
