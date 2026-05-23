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

`useYieldRate()` returns the vault's rate snapshot plus a net APY (`apyBps` — gross spoke yield reduced by the vault's `yieldFeeBps`). The modal renders via `rateToApy(rate.apyBps)`:

- No rate yet → "syncing…" copy in the APY panel
- `apyBps === 0n` → "unavailable — pool currently pays no yield" (Aave reserve set to 0)
- Otherwise → "~X.XX%" with the caveat "Based on the vault's recent rate; the actual yield earned will vary."

## What's wired now

- Executor handlers for `yield-deposit` and `yield-withdraw` are registered. Submit walks `build-proof` → `submit-relayer` → `hub-confirmed` via the adapter's atomic lend/redeem entry point (`buildYieldAdaptTransaction` in `lib/railgun/yield.ts`).
- `useYieldRate()` polls `vault.convertToAssets(1e18)` + net APY (`spoke.annualYieldBps × (10_000 - vault.yieldFeeBps) / 10_000`) on the hub every 5 min (visibility-gated). EarnModal calls `refresh()` on open + post-submit so the user always sees fresh state at the moments that matter.
- Withdraw slippage: the modal refreshes the rate immediately before computing shares to bound the slippage window to ~1 block. A `minUsdcOut` proof-bound parameter on the adapter would close the residual window — tracked in the polish doc.
- `useShieldedBalanceSync` writes both `shieldedUsdcAtom` and `yieldSharesAtom` so the user's shielded ayUSDC balance is visible.

## Still stubbed

_none_
