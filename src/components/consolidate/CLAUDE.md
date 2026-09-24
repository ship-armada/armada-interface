# components/consolidate/

The "Merge notes" (note consolidation, armada-sdk #98) UI. A wallet holding many small notes can't make
some spends: unshields, cross-chain unshields and yield ops never split, and have no circuit above 4
input notes. A merge folds one token's notes into fewer, relayer-submitted, with one USDC per-proof fee
per proof.

| Component | Purpose |
|---|---|
| `ConsolidationSummary` | Summary table: date (confirmed only), token, notes `N → M`, fees, and a Total that is just the fee (a merge moves no value out of the wallet). Reuses the deposit summary's styles. Used by the review step and the Activity receipt. |

## Conventions
- Dumb components only. Planning / pricing lives in `lib/shielded/consolidate-sdk.ts` (+ its hook), and
  the tx runs through the `consolidate` kind (`features/consolidate/handler.ts`).
- A `consolidate` record's `meta.amount` is always `0n`; the fee (`broadcasterFeeAmount`) is the only
  USDC that leaves. Rows and receipts show the fee (`lib/tx/headlineAmount`).
