# components/payments/

The **Send** flow — pay someone in USDC, either privately (0zk → 0zk) or to an external EVM
wallet (0x). Opened via `setOpenModal('payment')`; recipient starts empty.

**Send-only.** The former `withdraw` variant (unshield to your OWN wallet) moved to the
Shield/Unshield tabbed modal (`components/shield/`, Unshield tab). SendModal no longer opens in a
withdraw variant — but `SendReviewStep` / `SendCompleteStep` keep their `variant="withdraw"` copy,
which the Unshield tab and `ActivityReceipt` reuse to render unshield reviews/receipts.

## Contents

| Component | Purpose |
|---|---|
| `SendModal` | Orchestrator. Owns step + form state; derives `variant` from the open modal kind. Three `useTx` hooks mounted (`transfer-shielded` / `unshield-local` / `unshield-xchain`); the submitted one's record drives Progress + Complete. |
| `SendRecipientStep` | First step. Editable recipient (0zk or 0x), a privacy indicator, a destination-chain selector shown **only** for public 0x recipients, and a **recent-recipients list** below the action row. Continue is gated on a valid address. |
| `RecentAddressList` | Presentational "Recent address" list — previously-used recipients as one-tap rows (arrow badge + truncated address + relative time). Data comes from `useRecentRecipients` (derived from settled tx history); a click fills the recipient and restores its destination chain. Empty history renders nothing. Hidden on mobile once a valid address is typed. |
| `SendInputStep` | Amount step. `DepositAmountCard` with the chain rendered **statically** (chosen on the recipient step). Gates Review on the amount only. |
| `SendReviewStep` | Read-only echo. Shows the resolved mode label (Private transfer / External wallet) + cross-chain tag when applicable. Variant drives the headline + confirm label. |
| `SendCompleteStep` | Frost-card confirmation; title by variant (send → "USDC send confirmed", withdraw → "USDC unshield confirmed"). |

## Step machine

`recipient → input (amount) → review → progress → complete` (or `error`, overlaid on the failed
step). The `FlowShell` Steps bar is a dedicated 4-segment indicator — `['Recipient', 'Amount',
'Review', 'Confirm']` — with `currentStep` mapping `recipient→1, input→2, review→3, else→4`.

## Kind selection (address-driven, no tabs)

```
isShieldedAddress(recipient)  (0zk)         → transfer-shielded
else (valid 0x), destChainId = hub          → unshield-local
else (valid 0x), destChainId = client       → unshield-xchain
```

Recipient validation accepts EITHER a valid shielded (0zk) OR a valid EVM (0x) address. The 0zk
transfer has no destination-chain concept, so the chain selector is hidden for it and the flow
stays on the hub.

The "Send to someone else" vs "Withdraw to my wallet" distinction is purely UX — both public paths
produce `unshield-*` records. History rows show "Withdraw" by default.

## What's wired now

- All three handlers (`transfer-shielded`, `unshield-local`, `unshield-xchain`) are registered —
  private, external-to-hub, and external-to-client all run end-to-end. Submit-meta shapes + fee
  math (`userFeeForKind`, `cctpFastFeeForAmount`, `computeFeeBreakdown`, `useDisplayFees`) are
  shared across the kinds.
- A private (0zk) send's fee is **planned, not quoted**: a wallet of many small notes splits into
  several proofs, each paying the quoted `transfer` fee. `useTransferFeePlan` prices the send at
  review (total fee, fee-aware Max, Confirm blocked while pricing or when the
  planner refuses). At Confirm the send is re-priced at the fresh quote; a different total bounces
  back to Review with the FeeUpdatedBanner. The record stores the approved total
  (`broadcasterFeeAmount`) and the per-proof fee (`broadcasterFeePerProof`). Unshields never split,
  so they keep the quoted fee.
- A send blocked because the wallet is too fragmented offers **"Merge notes"** — in Review's blocked
  notice (from the planner, before any attempt) and on the error step (from the record's
  `remedy: 'merge-notes'`). It opens the `merge` modal (`components/consolidate/`) with the blocked
  send, so the merge preview can say whether one merge unblocks it.

## Folder name

The folder is `payments/` (vs the action buttons' "Send" / "Withdraw" labels) to align with the
`ModalKind = 'payment'` atom value. `'withdraw'` opens the same modal in its withdraw variant.
