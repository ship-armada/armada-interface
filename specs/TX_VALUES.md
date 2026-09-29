# Transaction Values

What every figure the app shows for a transaction means, where it comes from, and which surfaces must
agree. This spec is normative: every row ID (`SH-…`, `PS-…`, …) is meant to be pinned by a test, and a
change to how a figure is computed or displayed changes its row here in the same PR.
Figures are pinned per row in `src/lib/fees/txFigures.test.ts` (test names carry the row IDs; rows the code
doesn't meet yet are `it.todo`s naming their deviation) and, per surface, in the Activity receipt and
confirmation-screen tests that use the shared fixture `src/test/fixtures/txValues.ts`.

Markers: **[Dn]** = the row follows design decision Dn (§9); **Deviation Fn** = the code does not meet the
row yet (§8).

## 1. Notation

| Symbol | Meaning |
|---|---|
| `A` | The amount the user typed (USDC, 6 decimals). |
| `F` | The relayer's per-proof fee from the `/fees` quote (tier per kind — `lib/fees/displayFees.ts::relayerFeeKeyForKind`). |
| `Φ` | The relayer fee a *spend* actually pays = Σ of its broadcaster fee notes: `F` (normal, sweep), `F + c` (fold-in, `c` = the folded change), `k·F` (split into `k` proofs; a split can also land on fewer proofs and still pay `k·F`). Planned at Review (`useTransferFeePlan`, `useSpendCheck`, `useConsolidationPlan`), recorded by the handler as `meta.broadcasterFeeAmount`. |
| `P` | The pool's protocol shield fee (`ArmadaFeeModule` take, ~50 bps) on the note that reaches the pool. Unshields: the pool charges none (`TransactModule`: "unshield is free per spec"; the `Unshield` event's fee is always 0). |
| `P'` | `P` charged on the actual base once the CCTP fee is known (cross-chain shields: `A − F − C'` instead of `A − F − C`). |
| `C` / `C'` | The CCTP fast fee: `C` = the estimate (`lib/relayer.ts::cctpFastFeeForAmount`), `C'` = Circle's actual `feeExecuted`. The burn binds `maxFee = 2C`. |
| `G` | A vault withdrawal's actual redeemed gross (USDC) — the handler reconciles `meta.amount` to it (`features/yield-withdraw/redeemedGross.ts`). |

Reference fixture used in the examples (distinct, non-zero so any mis-sum is visible):
`A = 10`, `F = 1.000003`, `P = 0.020011`, `C = 0.300007`, `C' = 0.150001`, `c = 0.123457`, `k = 2`.

## 2. Surfaces

| Key | Surface | Where |
|---|---|---|
| AMT | Amount step fee caption + breakdown tooltip + Max | `DepositAmountCard`, `FeeBreakdownTooltip`; per-flow hooks/modals |
| REV | Review step | `ShieldReviewStep`, `SendReviewStep` → `TransferReviewSummary`, `EarnReviewSummary`, `ConsolidationSummary` |
| CNF | Confirm / complete step | `ShieldCompleteStep`, `SendCompleteStep`, `EarnCompleteStep`, `MergeCompleteStep` |
| ROW | Activity list row | `components/dashboard/txActivityAdapter.ts` (magnitude from `lib/fees/txFigures.ts::txHeadline`) |
| RCPT | Activity receipt | `components/dashboard/ActivityReceipt/ActivityReceipt.tsx` |
| REC | Receipt of a record recovered from chain history | SDK `reconstructHistory` → `lib/shielded/history.ts::historyEntryToTxRecord` (+ `xchain-recovery.ts`) → RCPT |
| RCV | The recipient's receipt of a private send | `transfer-shielded-received` in RCPT |

## 3. Invariants (all kinds)

- **G-1 The record is the source after submit.** CNF, ROW and RCPT render money figures only from the
  record's `meta`, through `lib/fees/txFigures.ts` (`txFigures` / `txHeadline`) — never from a live quote, live
  rate or form state.
- **G-2 Review figures are stored.** REV renders the draft record it will submit (`TxDraft` — kind + meta)
  through `txFigures`, and submit sends that draft (plus the fresh quote's cache id and broadcaster address), so
  every figure REV shows is in `meta` by construction — an estimate as an estimate — and nothing shown at REV
  can silently vanish later. Submit re-prices first and bounces back to REV if the fee moved.
- **G-3 REV → CNF may change only where a kind lists it** (§5–§7 "Allowed differences"), and then CNF
  shows the actual value.
- **G-4 Unknown is "—", never 0.** A figure that isn't known (plan pending/failed, no quote yet, a fee
  recovery couldn't attribute) renders "—". Placeholders (the one-proof quote while a plan is pending,
  `?? 0n` defaults) are never shown as a fee — before a relayer-paid flow's fee quote loads, its fee reads "—"
  and Confirm is held (`QUOTE_PENDING_REASON`). One known exception on recovery: a spend whose fee note the scan
  couldn't attribute, where nothing else pins the fee down, reads its fee as 0 — an absent fee note can't be told
  from a genuinely fee-free (older, wallet-submitted) spend. A private send's is derived when its recipient notes
  were recovered (below).
- **G-5 Estimates are marked.** A figure that is an estimate (CCTP fee before reconciliation, a vault
  withdrawal's gross before execution) carries "≈" / "est." wherever it is shown.
- **G-6 Recovered = authored.** For the same on-chain tx, REC shows the same headline, fees and totals as
  the authored RCPT, except where a kind lists an allowed difference. *Deviations F8, F13.*
- **G-7 The rows add up.** Fee-on-top kinds: Amount + Fees = Total deducted. Fee-inclusive kinds (shields,
  a vault withdrawal): Amount − Fees = You'll receive. A fee that is neither on top nor inside the user's own
  figure — the CCTP fee of a cross-chain unshield, taken from the amount in transit — gets its own row,
  labelled as taken from the amount, and is not part of "Fees".
- **G-8 List row = receipt headline [D1].** ROW shows the same number as RCPT's big numeral, signed by
  direction (+ in, − out). Formatting: ROW 0–2 dp, RCPT/REV/CNF full precision (2–6 dp).
- **G-9 Non-settled receipts.** When a failed or cancelled record's first on-chain transaction never
  confirmed, nothing was charged: its receipt shows the headline struck through and fees / totals /
  "You'll receive" as "—". When the first transaction did confirm and a later leg failed (a cross-chain
  delivery — the lifecycle passed `hub-burn-confirmed` / `client-burn-confirmed`), the fee and amount did
  leave: the receipt shows them as charged, under the failure banner. An indeterminate outcome (expired, timed out,
  dismissed) may have settled, so it keeps its figures. (`lib/fees/txFigures.ts::moneyMoved`.)
- **G-10 Every flow that builds the same kind renders the same figures** (Send-modal public path and the
  Unshield tab both build `unshield-*` records with one builder, `lib/tx/spendDraft.ts`).
- **G-11 Balances are the real balance only.** The private balance shown anywhere is the SDK's scanned
  balance; until it is known the UI shows a loading state — never a figure derived from local history.
  *Deviation F27.*

## 4. Fee model per kind (what moves on chain)

| Kind | Leaves the user | Recipient / user gets | Relayer | Pool | Circle | Model |
|---|---|---|---|---|---|---|
| `shield` gasless | `A` (public) | `A − F − P` (private) | `F` (its own note pays its shield fee) | `P` | – | fee-inclusive |
| `shield` direct | `A` (public) + native gas | `A − P` | – | `P` | – | fee-inclusive |
| `shield-xchain` gasless | `A` (public, source chain) | `A − F − C' − P` | `F` | `P` | `C'` | fee-inclusive |
| `shield-xchain` direct | `A` + native gas | `A − C' − P` | – | `P` | `C'` | fee-inclusive |
| `transfer-shielded` | `A + Φ` (private) | recipient `A` | `Φ` | – | – | fee-on-top |
| `unshield-local` | `A + Φ` (private) | recipient `A` (public) | `Φ` | 0 | – | fee-on-top |
| `unshield-xchain` | `A + Φ` (private) | recipient `A − C'` (public, dest chain) | `Φ` | 0 | `C'` | fee-on-top + from recipient |
| `yield-deposit` | `A + Φ` (private USDC) | vault `A` → shares | `Φ` | – | – | fee-on-top |
| `yield-withdraw` | shares worth `G` | `G − F` (private USDC) | `F` (skimmed from proceeds, contract-side) | – | – | fee-from-proceeds |
| `consolidate` | `Φ` (USDC) | – (notes merged in place) | `Φ` = `k·F` (USDC) or `(m+1)·F` (m share groups + the USDC fee group) | – | – | fee only |

Unshield, yield and consolidate spends are never split across proofs; fold-in and sweep apply to every spend.
A sweep grows the change note only — every figure is unchanged.

## 5. Shield

### `shield` (same-chain)

| ID | Figure | Formula | Surfaces | Fixture (gasless / direct) |
|---|---|---|---|---|
| SH-1 | Headline | `A` | REV, CNF, RCPT, REC | 10 / 10 |
| SH-2 | Fees | gasless `F + P`, direct `P` | REV, CNF, RCPT, REC | 1.020014 / 0.020011 |
| SH-3 | You'll receive | gasless `A − F − P`, direct `A − P` | AMT tooltip, REV, CNF, RCPT, REC | 8.979986 / 9.979989 |
| SH-4 | Row | `+A` | ROW | +10 / +10 |
| SH-5 | Max | public USDC balance (fee-inclusive); minimum `> F` on gasless | AMT | – |
| SH-6 | `P` base | the note that reaches the pool: gasless `A − F`, direct `A` (`shieldProtocolFeeBase`) | REV → `meta.protocolFee` | – |

- **Stored:** `amount = A`, `feeAmount = F` (gasless), `protocolFee = P`. CNF/RCPT via `txFigures` (`deposit`). REV
  reads `P` from the fee module with the integrator the shield will carry (the configured one only for a direct
  same-chain shield — `shieldFeeIntegrator`); while that read is pending there is no fee ("—", Confirm held), and if
  the fee module can't be read `P` is the ~50 bps estimate, stored with `protocolFeeIsEstimate` and shown "≈". On
  confirmation the handler reads the pool's actual `P` (and relayer fee) off the SDK history entry
  (`recordedShieldFees`, shared with `shield-xchain`), clearing the marker.
- **Recovered:** SDK `value = A − F − P` (user notes), `shieldFee = P`, `broadcasterFee` = the relayer note's
  **gross** (`F`, including its own shield fee — SDK #92), so `amount = value + shieldFee + broadcasterFee = A`
  exactly. A scan snapshot written before SDK #88 has no relayer fee: amount `A − F`, fee `P`, shown as a
  direct shield (net still exact) — accepted.
- **Allowed differences:** REV (the fee module's figure, or a marked estimate) → CNF (the pool's actual `P`).

### `shield-xchain`

| ID | Figure | Formula | Surfaces | Fixture (gasless / direct) |
|---|---|---|---|---|
| SH-10 | Headline | `A` (the burn amount) | all | 10 / 10 |
| SH-11 | Fees at REV | `F + P + C` (est.) | AMT, REV | 1.320021 / 0.320018 |
| SH-12 | You'll receive at REV | `≈ A − F − P − C` | REV | ≈ 8.679979 / ≈ 9.679982 |
| SH-13 | Fees settled | `F + P' + C'` (actuals) | CNF, RCPT, REC | 1.170015 / 0.170012 |
| SH-14 | You received settled | `A − F − P' − C'` | CNF, RCPT, REC | 8.829985 / 9.829988 |
| SH-15 | Fees / receive while pending | as SH-11/12, marked ≈ | RCPT | 1.320021 / ≈ 8.679979 |
| SH-16 | Row | `+A` | ROW | +10 |

- **Stored:** `amount = A`, `feeAmount = F`, `protocolFee = P` (est.), `cctpFee = C` with `cctpFeeIsEstimate` at
  submit; the handler reconciles `amount`, `cctpFee = C'` (hub `MessageReceived`, clearing the marker),
  `protocolFee`, `feeAmount` (SDK entry) in the write that completes the record. While the marker is set — pending,
  or the delivery couldn't be read — Fees and the net read "≈". A record without the marker (written before it
  existed) holds the reconciled actual.
- **Recovered:** `amount` = the CCTP burn amount, `cctpFee = C'` from the hub `MessageReceived`; one row per
  deposit. An authored record matches the hub mint by `destTxHash`, or — when it never learned it (delivery in
  flight, or polling timed out) — by the shield request's marker in the hub message's hook data: an in-flight one is
  left to its handler; a timed-out one completes with the hub mint hash and the chain's actual figures.
- **Allowed differences:** REV (estimate, "≈") vs CNF (actual): by `C − C'` and the `P` base change.
- **Deviations:** F20 (recovery with no CCTP routing records a
  same-chain `shield`, headline short by `C'`).

## 6. Private send

### `transfer-shielded`

| ID | Figure | Formula | Surfaces | Fixture normal / split k=2 / fold-in |
|---|---|---|---|---|
| PS-1 | Headline | `A` | REV, CNF, RCPT, REC | 10 |
| PS-2 | Fees | `Φ` | AMT, REV, CNF, RCPT, REC | 1.000003 / 2.000006 / 1.12346 |
| PS-3 | Total deducted | `A + Φ` | AMT tooltip, REV, CNF, RCPT, REC | 11.000003 / 12.000006 / 11.12346 |
| PS-4 | Row | `−A` [D1] | ROW | −10 |
| PS-5 | Fee while planning / unplannable | "Estimating fees…" / "—" (Confirm held) | AMT, REV | – |
| PS-6 | Max | SDK `maxTransferAmount` | AMT | – |
| PS-7 | Send-to-self | Not authorable — the Recipient step rejects the wallet's own 0zk. A record whose recipient is the wallet's own 0zk (authored before that guard, or recovered as the SDK's `self-transfer`) renders as a merge (§7 `consolidate`): amount 0, Fees = Total = `Φ` | AMT (block), CNF, ROW, RCPT, REC | Fees = Total 1.000003 |

- **Stored:** `amount = A`, `broadcasterFeeAmount = Φ` (the handler patches in the fee actually charged),
  `broadcasterFeePerProof = F`. CNF/RCPT via `txFigures` (`spend`).
- **Recovered:** SDK `transfer-sent`: `amount = Σ sentOutputs` (all recipient notes of a split),
  `broadcasterFeeAmount` = Σ every BroadcasterFee output of the tx (`k·F` for a split, `F + c` for a fold-in).
  A fold-in has no change note, so its self-metadata (`feeCacheId`) is lost — not displayed, accepted.
- **Allowed differences:** CNF/RCPT fee < REV fee when the build charges less than planned (the build can
  never charge more — `SpendFeeIncreasedError`); CNF shows the actual.
- A recovered send whose fee note wasn't attributed but whose recipient notes were: its fee is the outflow they
  don't account for (`|value| − Σ sentOutputs`).

### `transfer-shielded-received` (history-only)

| ID | Figure | Formula | Surfaces | Fixture |
|---|---|---|---|---|
| PS-10 | Headline | Σ notes the tx paid us (split sends fold into one entry — SDK #101) | RCV | 10 |
| PS-11 | Fees | none (no Fees row) | RCV | – |
| PS-12 | Row | `+A` | ROW | +10 |

- **Deviations:** F22 (layout: an empty "To recipient" row and a "Total" that repeats the amount; a disclosed
  sender and memo are recovered but not shown).

## 7. Unshield, yield, merge

### `unshield-local` / `unshield-xchain`

Both entry flows — the Send modal's public path and the Unshield tab — must render identical figures (G-10).

| ID | Figure | Formula | Surfaces | Fixture local / xchain |
|---|---|---|---|---|
| UN-1 | Headline | `A` | REV, CNF, RCPT, REC | 10 / 10 |
| UN-2 | Relayer fee ("Fees" on local) | `Φ` (plus the protocol unshield fee, 0 by contract) | AMT, REV, CNF, RCPT, REC | 1.000003 / 1.000003 |
| UN-2x | CCTP fee (xchain only; "taken from the amount") | `C` marked est. → `C'` once known at delivery; est. wherever not known with certainty (REC) | AMT, REV, CNF, RCPT, REC | – / est. 0.300007 → 0.150001 |
| UN-3 | Total deducted | `A + Φ` | AMT tooltip, REV, CNF, RCPT, REC | 11.000003 / 11.000003 |
| UN-5 | Row | `−A` [D1] | ROW | −10 |
| UN-6 | Network | hub (local) / destination chain (xchain) | REV, CNF, RCPT, REC | – |
| UN-7 | Label | "Unshield" when the recipient is the currently connected EVM wallet, else "Send" — the same rule on every post-submit surface; REV keeps its flow's wording | CNF, ROW, RCPT, REC | – |
| UN-8 | Max | SDK `maxUnshieldAmount` | AMT | – |

- **Stored:** `amount = A`, `broadcasterFeeAmount = Φ`, `broadcasterFeePerProof = F`, `protocolFee` (0 by
  contract), xchain `cctpFee = C` with `cctpFeeIsEstimate`. On delivery the handler replaces it with Circle's actual
  `feeExecuted` (`C'`) — from the relayer's delivery status, or the destination `MessageReceived` body on the
  on-chain fallback — and clears the marker, in the write that completes the record [D4]; when neither reports it
  the estimate stays, marked. A record without the marker (written before it existed) holds the estimate.
- **Recovered:** SDK `unshield`: `amount = |value| − broadcasterFee` (gross `A`), `protocolFee = unshieldFee`,
  `recipient = Unshield.to` — for a cross-chain exit that is the **final recipient** (`TransactModule` emits
  `Unshield(finalRecipient, …)`), not the pool. A cross-chain exit is identified by the hub CCTP `MessageSent`
  in the same tx; `cctpFee` = the estimate read back from the burn's `maxFee` (`cctpFeeEstimateFromMaxFee`),
  marked est. — the hub doesn't see the actual fee [D4].
- **Allowed differences:** as `transfer-shielded` (build charged less). xchain REV (est.) → CNF (actual) by
  `C − C'`. A recovered xchain receipt shows the estimate (marked) where the authored one shows the actual.

### `yield-deposit`

| ID | Figure | Formula | Surfaces | Fixture normal / fold-in |
|---|---|---|---|---|
| YD-1 | Headline | `A` | REV, CNF, RCPT, REC | 10 |
| YD-2 | Fees | `Φ` | AMT, REV, CNF, RCPT, REC | 1.000003 / 1.12346 |
| YD-3 | Total deducted from balance | `A + Φ` | AMT tooltip, REV, CNF, RCPT, REC | 11.000003 / 11.12346 |
| YD-4 | Estimated APY | frozen `meta.apyBps`; REC hides the row when the deposit left no change note | REV, CNF, RCPT, REC | – |
| YD-5 | Row | `−A` [D1] | ROW | −10 |
| YD-6 | Max | SDK `maxUnshieldAmount` | AMT | – |

- **Recovered:** `amount = |value| − broadcasterFee`; APY from the change note's self-metadata. A deposit that
  left no change note (every Max deposit, every fold-in) has nothing to carry it, so its recovered receipt hides
  the APY row — accepted.

### `yield-withdraw`

| ID | Figure | Formula | Surfaces | Fixture (review rate 1.05, `G` = 9.999999) |
|---|---|---|---|---|
| YD-10 | Headline | REV `≈ A`; settled `G` | REV / CNF, RCPT, REC | ≈ 10 / 9.999999 |
| YD-11 | Fees | `F` (the quote — never planned; skimmed from the proceeds) | AMT, REV, CNF, RCPT, REC | 1.000003 |
| YD-12 | You'll receive / Received | REV `≈ A − F`; settled `G − F` | AMT tooltip, REV / CNF, RCPT, REC | ≈ 8.999997 / 8.999996 |
| YD-13 | Total deducted | none — the private balance isn't debited | – | – |
| YD-14 | Estimated APY | frozen `meta.apyBps`; REC recovers it from the share change note's self-metadata (SDK carries it onto the USDC leg); a full withdrawal leaves no share change, so REC hides the row | REV, CNF, RCPT, REC | – |
| YD-15 | Row | `+G` [D1] | ROW | +10 (2 dp) |
| YD-16 | Max | the vault position (fee not subtracted); blocked when `amount ≤ F` | AMT | – |

- **Stored:** the typed `amount` with `amountIsEstimate` at submit; the handler reconciles it to `G` (clearing the
  marker) in the write that completes the record. While marked — the redeemed gross couldn't be read — the headline
  and net read "≈"; history recovery confirming such a record adopts the chain-derived `G`. A record without the
  marker (written before it existed) holds the reconciled actual.
- **Recovered:** `amount = value + broadcasterFee` (`G`), `shares` from the adapter unshield.
- **Allowed differences:** REV (≈, typed amount) → CNF (`G`): headline and net change; the fee does not.
  `G < A` by µUSDC is normal (the share count is floored).
- **Deviations:** F8 (a recovered withdrawal never has APY — the SDK carries the self-metadata on the share leg,
  which the app drops; the app test feeds a shape the SDK never produces), F15 (Max
  converts through USDC and back — leaves share dust, counts pending shares, ignores the one-tree rule).

### `consolidate` (Merge notes)

| ID | Figure | Formula | Surfaces | Fixture (k = 2) |
|---|---|---|---|---|
| MG-1 | Headline | REV/CNF: notes `N → M`; RCPT/REC: the fee (a merge moves no value) | REV, CNF / RCPT, REC | 11 → 2 / 2.000006 |
| MG-2 | Fees = Total | `k·F` (USDC) or `(m+1)·F` (non-USDC) | REV, CNF, RCPT, REC | 2.000006 |
| MG-3 | Row | `−Φ` | ROW | −2 |
| MG-4 | Token / notes merged | from meta | REV, CNF, RCPT | – |

- **Recovered:** the SDK reports a merge as `transfer-sent` with no recipients (the merged note is a Change
  output); the self-metadata tag `m: 1` on the USDC change note maps it back to `consolidate`. Token and note
  counts aren't recoverable, so REC hides those rows — accepted [D9].
- **Allowed differences:** MG-1's headline differs by surface, by design. Note counts can differ between REV and
  CNF when the fee doesn't (re-review is fee-triggered).
- A non-USDC merge whose USDC fee group was an exact cover has no USDC change note; its share leg's tag marks the
  txid, so the USDC fee leg still recovers as the merge (`withConsolidationTxids`).

## 8. Deviation register

Ranked by severity: **S1** wrong money on a settled surface; **S2** surfaces disagree; **S3** degraded
fallback / old records; **S4** cosmetic or labelling.

| ID | Sev | Kind(s) | Summary | Issue |
|---|---|---|---|---|
| F8 | S2 | yield | Recovered withdrawals never show APY; recovered no-change deposits (all Max, fold-in) lose it too. | #76, armada-sdk#113 |
| F13 | S3 | many | Recovery never corrects an existing record (dev-era split fees; pre-SDK #101 received rows). | #81 |
| F15 | S4 | yield-withdraw | Max leaves share dust / counts pending shares / ignores one-tree rule. | #82 |
| F20 | S3 | shield-xchain | Recovery without CCTP routing → same-chain `shield`, headline short by `C'`. | #81 |
| F22 | S4 | received | Receipt layout (empty recipient row, "Total", sender/memo hidden). | #83 |
| F26 | S4 | shield | Labels: "+ fee" caption on fee-inclusive deposits; "Approve 10 USDC" while approving unlimited. | #83 |
| F27 | S3 | all | The balance shown before the SDK sync lands is derived from local history, ignoring fees, received payments and merges (G-11). | #80 |
| F28 | S4 | docs/tests | A stale comment (a recovered shield "runs short") and a test fixture that encodes a shape the SDK never emits (withdraw USDC-leg `selfMetadata`). | #76, #81 |

## 9. Decisions

| ID | Question | Decision |
|---|---|---|
| D1 | List row: the headline amount or the balance delta? | the headline amount (the typed / gross figure; a merge shows its fee) — it matches the receipt numeral; the receipt carries the totals. |
| D2 | Cross-chain unshield fee rows | itemised — "Relayer fee" (`Φ`), "CCTP fee" (taken from the amount; est. until known), "Total deducted" (`A + Φ`). No "Recipient receives" row. See G-7. |
| D3 | Send-to-self | blocked at the Recipient step. Existing authored send-to-self records and recovered `self-transfer`s render as a merge (amount 0, fee only). |
| D4 | #68: where does the actual CCTP fee `C'` come from? | reconciled at delivery for authored records (same pattern as `shield-xchain`). Any CCTP fee not known with certainty — before delivery, a recovered record, a failed read — is shown marked "est.". |
| D5 | Failed / cancelled receipts | see G-9 — "—" when the first on-chain tx never confirmed; charged figures when it did and a later leg failed. |
| D6 | APY on recovered yield records | the SDK carries the share leg's self-metadata onto the USDC leg (withdrawals); recovered deposits with no change note and full withdrawals hide the row — accepted. |
| D7 | Tell the user when CNF differs from REV (build charged less; a withdrawal's `G` vs its estimate)? | no — CNF shows the actual; these are allowed differences (G-3). |
| D8 | Unshield vs Send label | one rule on CNF, ROW and RCPT — "Unshield" when the recipient is the currently connected EVM wallet, else "Send" (REV keeps its flow's wording). A restored wallet viewed from a different EVM wallet labels its past unshields "Send" — accepted. |
| D9 | Recovered merges lose the Token / Notes rows | accepted — informational only; money figures are recovered exactly. |
| D10 | Balance before the SDK sync lands | retire the history-derived fallback (`computePrivateUsdcFromTxHistory`); show a loading state until the real (SDK) balance is known — see G-11. |
