# components/payments/

The Send flow — pay someone in USDC, either privately (0zk → 0zk) or to an external EVM wallet. Opened via `setOpenModal('payment')`.

## Contents

| Component | Purpose |
|---|---|
| `SendModal` | Orchestrator. Three `useTx` hooks mounted (`transfer-shielded` / `unshield-local` / `payment-xchain`); dispatches to whichever matches the tab + destination chain. |
| `SendInputStep` | Tabs (`Private` / `External`) + per-tab fields. Recipient validation switches per tab — 0zk on Private, 0x on External. |
| `SendReviewStep` | Read-only echo. Shows the resolved mode label + cross-chain tag when applicable. |
| `SendCompleteStep` | Success copy adapts to private vs external + chain. |

## Kind selection

```
tab=private                            → transfer-shielded
tab=external, destChainId = hub        → unshield-local
tab=external, destChainId = client     → payment-xchain
```

## Recipient handling

Switching tabs clears the recipient field, since 0zk and 0x have incompatible shapes and a leftover value from the other tab would always be invalid. Re-typing is the safer UX.

## What's stubbed

- `useFees()` returns null → FeeSummary shows "Loading…" indefinitely.
- Executor handlers for all three kinds aren't registered yet; Progress shows the stepper at the initial stage.
- `shieldedUsdcAtom` is null until Railgun sync; max defaults to 0 → Continue stays disabled.

## Folder name

The folder is `payments/` (vs the action button's "Send" label) to align with the existing `ModalKind = 'payment'` value and the `payment-xchain` lifecycle. Externally we keep saying "Send" in copy because that's the user-facing word.
