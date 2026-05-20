# components/payments/

The Send flow — pay someone in USDC, either privately (0zk → 0zk) or to an external EVM wallet. Opened via `setOpenModal('payment')`.

## Contents

| Component | Purpose |
|---|---|
| `SendModal` | Orchestrator. Three `useTx` hooks mounted (`transfer-shielded` / `unshield-local` / `unshield-xchain`); dispatches to whichever matches the tab + destination chain. External-tab + xchain reuses `unshield-xchain` — same contract path as the Withdraw modal, just a different UI entry. |
| `SendInputStep` | Tabs (`Private` / `External`) + per-tab fields. Recipient validation switches per tab — 0zk on Private, 0x on External. |
| `SendReviewStep` | Read-only echo. Shows the resolved mode label + cross-chain tag when applicable. |
| `SendCompleteStep` | Success copy adapts to private vs external + chain. |

## Kind selection

```
tab=private                            → transfer-shielded
tab=external, destChainId = hub        → unshield-local
tab=external, destChainId = client     → unshield-xchain
```

The "Send to someone else" vs "Withdraw to my wallet" distinction is purely UX — both produce
`unshield-*` records. History rows derived from these records show "Withdraw" by default; we
can later add an optional `recipientLabel` field to differentiate if the product needs it.

## Recipient handling

Switching tabs clears the recipient field, since 0zk and 0x have incompatible shapes and a leftover value from the other tab would always be invalid. Re-typing is the safer UX.

## What's wired now

- All three handlers (`transfer-shielded`, `unshield-local`, `unshield-xchain`) are registered — Private, External-to-hub, and External-to-client tabs all run end-to-end.

## Still stubbed

- `useFees()` returns null → FeeSummary shows "Loading…". Direct user-submitted paths don't have a relayer fee yet.

## Folder name

The folder is `payments/` (vs the action button's "Send" label) to align with the existing `ModalKind = 'payment'` atom value. Externally we keep saying "Send" in copy because that's the user-facing word.
