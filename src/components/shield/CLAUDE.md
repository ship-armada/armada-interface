# components/shield/

The deposit (public → private) flow. Owned by `ShieldModal`, opened via `setOpenModal('shield')`.

## Contents

| Component | Purpose |
|---|---|
| `ShieldModal` | Orchestrator. Owns `step` + form state, wires `useTx({kind:'shield'})`, renders ActionFlowShell. |
| `ShieldInputStep` | From-chain `ChainSelect` + `AmountInput` (display variant) + `FeeSummary`. Validates amount > 0 and ≤ max. |
| `ShieldReviewStep` | Read-only echo with the big-numeral amount + From chain row + FeeSummary + Confirm CTA. |
| `ShieldCompleteStep` | Success panel ("You're in") with the deposited amount + Done CTA. |

## State machinery

- `openModalAtom === 'shield'` controls visibility.
- Step state is local to `ShieldModal` — `'input' → 'review' → 'progress' → 'complete'` (or `'error'`).
- Form state (`fromChainId`, `amountStr`) is reset when the modal closes.
- `useTx({kind:'shield'}).submit(meta)` creates the record + dispatches the executor.

## Wallet-signing UX

`shield` is the only kind that requires a user wallet signature. The "Confirm in your wallet" copy is surfaced by `stageCopy.ts` when `executionState === 'waiting'` on the submit stage — `<TxLifecycleStepper>` (via `ProgressStep`) reads that automatically. No special handling here.

## What's stubbed

- `useFees()` returns `quote=null`; FeeSummary therefore renders "Loading…" for the fee line. Real fee source lands when relayer is wired.
- The shield executor handler isn't registered yet. `tx.submit()` creates the record + persists it, but the lifecycle never advances. `ProgressStep` shows the stepper at the initial stage indefinitely until the handler lands.
- `useBalances().unshielded[chainId]` is sourced from `usdcBalancesAtom` (empty `{}` until wallet balances poll). Today the MAX defaults to `0n`; the user can type but Continue stays disabled until balances populate.

## Why the modal lives at App level

`<ShieldModal />` is mounted once in `App.tsx` alongside the AppLayout outlet. Modal portal mounts to `document.body`, so opening Shield from any page (Dashboard / History / Settings) Just Works. The modal is invisible when `openModalAtom !== 'shield'`. Other feature modals (UnshieldModal, SendModal, YieldModal) will land at the same App level.
