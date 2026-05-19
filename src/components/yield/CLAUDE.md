# components/yield/

The Earn flow — deposit private USDC into the vault to earn yield, or withdraw earnings back to the private balance. Opened via `setOpenModal('yield-deposit')` (defaults Add Funds tab) or `setOpenModal('yield-withdraw')` (defaults Withdraw tab).

## Contents

| Component | Purpose |
|---|---|
| `EarnModal` | Orchestrator. Two `useTx` hooks (`yield-deposit` / `yield-withdraw`); tab switching changes both the max and the dispatched kind. |
| `EarnInputStep` | Tabs (`Add funds` / `Withdraw`) + amount + APY hint panel + fee summary. |
| `EarnReviewStep` | Echo of amount, mode, APY value used for the quote. |
| `EarnCompleteStep` | "You're now earning yield…" or "Returned X USDC to your private balance." |

## Kind selection

```
tab=add       → yield-deposit
tab=withdraw  → yield-withdraw
```

Both kinds are submitted via the relayer — no wallet pop.

## Amount semantics

- **Add Funds**: user enters USDC, modal submits `MetaYieldDeposit { amount }`. Max = `shieldedUsdcAtom`.
- **Withdraw**: user enters USDC, modal converts to shares via `shares = amount × 1e18 / rate` for `MetaYieldWithdraw { amount, shares }`. Max = `yieldShares × rate / 1e18` (computed via `sharesToUsdc`).

The conversion path means the displayed "amount" is the **expected USDC output**, not raw shares. If the rate moves between quote and execution, the user receives slightly more or less than displayed. The lifecycle handler will need to reconcile; today the rate source is stubbed.

## APY display

`useYieldRate()` returns `null` today (hook is stubbed). When real, the modal calls `rateToApy(rate.rate)` to display "~X.X%". Until then:

- No rate yet → "syncing…" copy in the APY panel
- Rate exists but `rateToApy` returns 0 (the current placeholder) → "unavailable while vault rate syncs"
- Real APY → "~X.X%" with the caveat "Based on the vault's recent rate; the actual yield earned will vary."

This is intentionally cautious — we'd rather show "unavailable" than a wrong number.

## What's stubbed

- `useYieldRate()` returns null → APY shows "syncing…", max=0 for the Withdraw tab.
- `useFees()` returns null → FeeSummary shows "Loading…".
- Executor handlers for both kinds aren't registered yet; Progress shows the stepper at the initial stage.
