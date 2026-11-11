# components/shield/

The **Shield / Unshield** tabbed flow — deposit (public → private) OR unshield (private → your own
EVM wallet), as two tabs on the amount step. Owned by `ShieldModal`, opened via `setOpenModal('shield')`
(Shield tab) or `setOpenModal('unshield')` (Unshield tab).

## Contents

| Component | Purpose |
|---|---|
| `ShieldModal` | **Dumb renderer** — open/close chrome + per-tab step rendering. Composes two controller hooks: `hooks/useShieldFlow.ts` (Shield) + `hooks/useUnshieldFlow.ts` (Unshield). The typed amount carries across the tab toggle. |
| `ShieldAmountStep` | Shared amount step (`ShieldAmountStepContent` + `Footer`) — `DepositAmountCard` with the Shield/Unshield `SegmentedControl` in its header + a chain picker (source for shield / destination for unshield) + `GasBalanceNotice` (direct-shield, against the estimated gas — `requiredGasWei` from the flow's `nativeGas`). On the direct path `useShieldFlow` also holds Review's Confirm (`gasShortReason`: "Not enough ETH in your wallet for network gas.") when the balance can't cover that estimate (4F). Direction-driven title/aria; footer gates Review on amount (+ shield's fee floor). |
| `ShieldReviewStep` / `ShieldCompleteStep` | **Shield direction** — frost card + `DepositReviewSummary` (its wallet and Armada addresses are shortened with a copy button, `ui/CopyableAddress`). Review adds "Wallet prompts" (gasless: "2 signatures, no gas"; direct: "Up to 2 transactions: approve, then shield" — spec SH-7) and "Est. time" rows; both steps tell the summary `gasless` so the "Fees" ⓘ lists the right parts. |
| `WalletDeclinedNotice` | The shield Review's quiet note after a declined wallet prompt (4D): "You cancelled in your wallet, so nothing was shielded. Confirm to try again." (info-toned, FeeUpdatedBanner styling). `useShieldFlow` sends a `USER_REJECTED` failure back to Review with `walletDeclined` set, instead of the error step; any other failure still shows the error screen. Cleared on the next Confirm, Back, or close. |
| `ShieldWalletStep` | Dedicated **Wallet** step (the mockup's step 3) — the live approve/sign checklist (`WalletConfirmList` + `lib/tx/shieldWalletSteps`). Each active row says where it is — "In your wallet" (prompt open) or "Confirming on chain" (the approval sent, `approveSubmittedHash`) — and the footer goes "Preparing your shield…" → "Step X of N · Confirm in your wallet" / "· Waiting for the network to confirm". The row whose prompt is open also says why (`why`): the permit lets Armada's shield contract take exactly the amount; the intent locks in where the USDC goes so the relayer can submit but not change it; the approval lets Armada's contract take exactly the amount; the shield sends the amount to the privacy pool (you pay the gas). Shield tab only; Unshield is relayer-submitted. |
| (unshield direction review/complete) | Reuses `payments/SendReviewStep` + `SendCompleteStep` with `variant="withdraw"` (the "Review unshielding transfer" / "USDC unshield confirmed" copy). |

## State machinery

- An Activity receipt's "Shield again" / "Unshield again" (`repeatIntentAtom`) opens the matching tab with its chain
  (source / destination) and amount filled in, on the amount step; `ShieldModal` seeds them through the flows' setters
  once open and consumes the intent.
- `openModalAtom === 'shield' \|\| 'unshield'` controls visibility; the value picks the initial tab.
- **Shield tab** → `useShieldFlow`: `shield` / `shield-xchain` by from-chain; wallet-signs (or gasless permit).
- **Unshield tab** → `useUnshieldFlow`: `unshield-local` / `unshield-xchain` by **to-chain picker**; recipient is pinned to the connected wallet; relayer-submitted.
- **Shield** step machine: `'input' → 'review' → 'wallet' → 'progress' → 'complete'` (or `'error'`). The `wallet` step shows the approve/sign checklist; `useShieldFlow` advances it → `progress` once `shieldWalletInteractionsComplete(record)`. Step indicator has 4 segments (Amount/Review/Wallet/Confirm).
- An **unshield** is planned (`useSpendCheck`, amount + review steps), so the fee shown is the one its plan charges — the SDK can fold small change into it — with "Estimating fees…" / "—" until it's known; Confirm re-prices it at the fresh quote and the record stores total + per-proof fee.
- A spend the wallet's notes are too fragmented for offers **"Merge notes"** — at review (from `useSpendCheck`: notice + disabled Confirm) and, as a fallback, on the error step (error `remedy: 'merge-notes'`) — opening the `merge` modal (`components/consolidate/`) with that spend as the one to unblock.
- **Unshield** step machine: `'input' → 'review' → 'progress' → 'complete'` (no wallet step; relayer-submitted). 3-segment indicator.
- Each controller owns its chain + step + submit + `amountStr`; `ShieldModal.handleTabChange` copies the typed amount into the other flow on toggle.

**Relationship to Send:** unshielding to your OWN wallet lives here (Unshield tab). Sending to an
arbitrary `0x`/`0zk` recipient is the Send flow (`payments/`, "send" copy). Both public paths are
`unshield-*` on-chain — the distinct copy is intentional (withdraw-to-self vs pay-someone).

## Wallet-signing UX

`shield` and `shield-xchain` are the only kinds that require a user wallet signature (direct: the approval + shield transactions; gasless: the USDC permit + ShieldIntent signatures). The prompts are shown on the dedicated `wallet` step (`ShieldWalletStep` → `flow/WalletConfirmList`, statuses from `lib/tx/shieldWalletSteps`); `useShieldFlow` advances to `progress` once they're done. If a prompt is still open on the submit stage, the progress view's `processing/processingView.ts` shows "Confirm in your wallet" (the `waiting` subtitle variant).

## What's wired now

- The shield handler (`features/shield/handler.ts`) is registered with the executor; `tx.submit()` runs the full `build-proof → submit-relayer → hub-pending → hub-confirmed` chain. `submit-relayer` covers broadcasting (wallet prompt / relay POST); once broadcast the record advances to `hub-pending` for the on-chain confirmation wait (the "Shielding / Confirming on chain" step), then `hub-confirmed` (terminal). `hub-pending` is a resume/retry entry — re-entry is idempotent via `sourceTxHash` (never re-broadcasts). Once the hub tx confirms, the handler records its block (`artifacts.hubBlock`: the receipt's, or the relayer status's) before the sync that scans it, so the dashboard projects the shield's note from broadcast and hands over to the scanned balance in that sync (spec G-12). The Unshield tab's amount card shows "· X arriving" (projected change and shields). Direct-submit path: the user's wallet prompts once (the on-chain `PrivacyPool.shield(...)`, with a USDC `approve` of exactly the amount first when the allowance is below it — `features/shield/approve.ts::ensureExactAllowance`, shared with the cross-chain shield, which re-reads the allowance once the approval confirms and stops with a PRE_FLIGHT_REVERT if a lowered spend cap left it short). Gasless path: two gas-free signatures — the EIP-2612 USDC permit (exact amount) then the EIP-712 ShieldIntent — and the relayer broadcasts. `shieldPrivateKey` is generated locally (random 32 bytes) at build-proof — no signing prompt for the Railgun-convention message; see `lib/shielded/shield.ts` for why randomness is correct.
- `useUsdcBalances()` (mounted in `App.tsx`) polls the connected wallet's USDC balance on the hub and every client chain into `usdcBalancesAtom` so the MAX is populated for whichever source chain is picked.
- After confirmation the handler triggers `refreshShieldedBalances`, which runs `wallet.sync()`; the SDK's balance events ping the balance bus and `useShieldedBalanceSync` writes the new shielded total into `shieldedUsdcAtom`.

## What's also wired

- **Fees are live.** `useShieldFlow` uses `useFees({ chainId })` (`quote` / `isStale` / `refresh()`); the gasless path reads `quote.fees.shield` / `quote.fees.shieldXchain` and submits a `feeCacheId`. Display flows through `useDisplayFees` + `computeFeeBreakdown` into the amount-card fee caption + breakdown tooltip.
- **Cross-chain shield is wired.** `useShieldFlow`'s `computeKind()` dispatches `shield` vs `shield-xchain`; the `shield-xchain` handler (per-client gasless wrapper + CCTP fast-fee via `cctpFastFeeForAmount`) runs end-to-end.

## Still stubbed

_none_

## Why the modal lives at App level

`<ShieldModal />` is mounted once in `App.tsx` alongside the AppLayout outlet. Modal portal mounts to `document.body`, so opening Shield from any page (Dashboard / Debug / Address book) Just Works. The modal renders nothing unless `openModalAtom` is `'shield'` or `'unshield'`. The other feature modals (`SendModal`, `EarnModal`, `RequestModal`, `MergeModal`) are mounted at the same App level.
