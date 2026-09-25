# components/consolidate/

The "Merge notes" (note consolidation, armada-sdk #98) UI. A wallet holding many small notes can't make
some spends: unshields, cross-chain unshields and yield ops never split, and have no circuit above 4
input notes. A merge folds one token's notes into fewer, relayer-submitted, with one USDC per-proof fee
per proof.

| Component | Purpose |
|---|---|
| `MergeModal` | Orchestrator for the `merge` modal (`openModalAtom === 'merge'`, prefilled from `mergeIntentAtom`). Review → Confirm (fresh quote; re-prices via `useConsolidationPlan.priceAt`, bouncing back with the FeeUpdatedBanner on a change) → progress → complete / error. Submits a `consolidate` record (`amount: 0n`, total + per-proof fee, token, note counts). "Merge again" when the blocked spend still needs another round. |
| `MergeReviewStep` | "Merge your <token> notes", notes `N → M`, the summary, whether the blocked action goes through afterwards, blocked-confirm notice, Cancel / Confirm merge. |
| `MergeCompleteStep` | "Notes merged" + summary, then "You can now retry your <action>" or "Merge again". |
| `ConsolidationSummary` | Summary table: date (confirmed only), token, notes `N → M`, fees, and a Total that is just the fee (a merge moves no value out of the wallet). Reuses the deposit summary's styles. Used by the review step and the Activity receipt. |

## Entry points
- A spend that failed for fragmentation: the error step's **"Merge notes"** (`useMergeNotes().remedyFor(record)`)
  in Send, Unshield (local + xchain) and Earn (deposit + withdraw), plus Send's review step when the
  planner already knows. The intent carries the blocked spend (`mergeIntentFromRecord`), so the preview
  dry-runs it (`planTransferAfter`).
- Settings → **Notes** card, per token with ≥ 5 notes.

## Conventions
- Dumb components only. Planning / pricing lives in `lib/shielded/consolidate-sdk.ts` (+ its hook), and
  the tx runs through the `consolidate` kind (`features/consolidate/handler.ts`).
- A `consolidate` record's `meta.amount` is always `0n`; the fee (`broadcasterFeeAmount`) is the only
  USDC that leaves. Rows and receipts show the fee (`lib/tx/headlineAmount`).
