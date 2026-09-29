// ABOUTME: txFigures — every money figure a tx surface shows (Review, Confirm, Activity row + receipt, a receipt recovered
// ABOUTME: from chain), derived from the record — or the draft Review will submit — alone. Spec: specs/TX_VALUES.md.

import type { MetaFor, TxKind, TxRecord } from '@/lib/tx/types'
import { txOutcome } from '@/lib/tx/outcome'

/** What figures derive from: a stored record, or the draft a Review step will submit (`TxDraft`) — its kind + meta. */
export type TxFiguresSource = Pick<TxRecord, 'kind' | 'meta'>

/**
 * The figures a record is shown with, shaped per summary layout:
 *  - `deposit` (shield, shield-xchain): fee-inclusive — the net received is `amount − fees`; `estimated` while a
 *    cross-chain shield's CCTP fee is still the review-time estimate (the fee and the net then read "≈").
 *  - `spend` (transfer-shielded, unshield-*): fee-on-top — the total deducted is `amount + relayer fee`, and
 *    `fee` is what's charged on top (relayer + any protocol fee), so Amount + Fees = Total. A cross-chain unshield's
 *    CCTP fee comes out of the amount in transit instead, so it's its own figure (`cctpFee`), not part of `fee`.
 *  - `yield` (yield-deposit, yield-withdraw): the per-tab net — deposit debits `amount + fee`, withdraw nets `amount − fee`;
 *    `apyBps` is the net vault APY the user reviewed, frozen on the record (null when it wasn't captured);
 *    `estimated` while a withdrawal's amount is still the typed estimate (its redeemed gross not yet read).
 *  - `merge` (consolidate): moves no value — the fee is both the headline and the only charge.
 *  - `received` (transfer-shielded-received): the amount credited; the recipient pays no fee.
 * `headline` is the big numeral and the Activity row's magnitude (the row adds the sign by direction).
 */
export type TxFigures =
  | { model: 'deposit'; headline: bigint; fee: bigint | null; netAmount: bigint; estimated: boolean }
  | { model: 'spend'; headline: bigint; fee: bigint; totalDeducted: bigint; cctpFee: CctpFeeFigure | null }
  | { model: 'yield'; headline: bigint; fee: bigint; netAmount: bigint; apyBps: bigint | null; estimated: boolean }
  | { model: 'merge'; headline: bigint; fee: bigint }
  | { model: 'received'; headline: bigint }

/** A cross-chain unshield's CCTP fee — taken from the amount in transit — and whether it's still the estimate. */
export interface CctpFeeFigure {
  amount: bigint
  estimated: boolean
}

/**
 * The figure a record is summarised by — the receipt's big numeral and the Activity row's magnitude: its
 * `meta.amount`, except a consolidation, which moves no value (amount 0) and is shown by the fee it paid.
 * Reads only what the headline is made of, so a list row renders even for a record whose fee fields are absent.
 */
export function txHeadline(record: TxFiguresSource): bigint {
  if (record.kind === 'consolidate') return (record.meta as MetaFor<'consolidate'>).broadcasterFeeAmount
  return record.meta.amount
}

/**
 * The figures every surface renders for `record` — the Review step for the draft it will submit, then every
 * post-submit surface for the stored record — so a tx reads identically wherever it's shown.
 */
export function txFigures(record: TxFiguresSource): TxFigures {
  switch (record.kind) {
    case 'shield':
    case 'shield-xchain': {
      // The note that lands = `amount − relayerFee − protocolFee − cctpFee`: the gasless wrapper carves the relayer
      // fee as its own note, the pool takes its ~50 bps shield fee, and (cross-chain) the CCTP mint deducts its fee.
      // `cctpFee` is only present on shield-xchain; both fee legs default to 0 on pre-capture records. Fee is `null`
      // (renders "—") when nothing was charged.
      const meta = record.meta as MetaFor<'shield' | 'shield-xchain'>
      const relayerFee = meta.feeAmount ?? 0n
      const cctpFee = 'cctpFee' in meta ? (meta.cctpFee ?? 0n) : 0n
      const totalFee = relayerFee + (meta.protocolFee ?? 0n) + cctpFee
      const netAmount = meta.amount > totalFee ? meta.amount - totalFee : meta.amount
      // A shield's stored CCTP fee is the actual unless marked otherwise (records predating the marker only ever
      // stored the reconciled actual).
      const estimated = cctpFee > 0n && 'cctpFeeIsEstimate' in meta && meta.cctpFeeIsEstimate === true
      return { model: 'deposit', headline: txHeadline(record), fee: totalFee > 0n ? totalFee : null, netAmount, estimated }
    }
    case 'transfer-shielded':
    case 'unshield-local':
    case 'unshield-xchain': {
      // The fee is what was actually charged (`broadcasterFeeAmount`, recorded at build: a fragmented wallet's split
      // send pays one per-proof fee per proof) plus the protocol fee recorded at review; the total deducted is
      // fee-on-top (`amount + broadcaster fee`), since the protocol fee comes out of the recipient's side, not the
      // shielded balance. A cross-chain unshield's CCTP fee is taken from the amount in transit (Circle deducts it
      // from the destination mint), so it's reported on its own — an estimate unless the actual replaced it (records
      // written before the marker existed only ever stored the estimate). Records written before the protocol / CCTP
      // fees were stored show the broadcaster fee alone.
      const meta = record.meta as MetaFor<'transfer-shielded' | 'unshield-local' | 'unshield-xchain'>
      const protocolFee = 'protocolFee' in meta ? (meta.protocolFee ?? 0n) : 0n
      const cctpFee = 'cctpFee' in meta ? (meta.cctpFee ?? 0n) : 0n
      return {
        model: 'spend',
        headline: txHeadline(record),
        fee: meta.broadcasterFeeAmount + protocolFee,
        totalDeducted: meta.amount + meta.broadcasterFeeAmount,
        cctpFee: cctpFee > 0n
          ? { amount: cctpFee, estimated: !('cctpFeeIsEstimate' in meta) || meta.cctpFeeIsEstimate !== false }
          : null,
      }
    }
    case 'yield-deposit':
    case 'yield-withdraw': {
      // The broadcaster fee is the only fee leg on yield kinds (no CCTP; protocol fee is 0 on these ops).
      //   - deposit: `netAmount = amount + fee` (total debited from the private balance).
      //   - withdraw: `netAmount = amount - fee` (net received into the private balance; the fee is skimmed from the
      //     redeemed proceeds). `amount` is the redeemed gross — the handler reconciles it to the ACTUAL
      //     execution-rate value at completion, so a completed withdraw reads identically wherever it's shown.
      const meta = record.meta as MetaFor<'yield-deposit' | 'yield-withdraw'>
      const fee = meta.broadcasterFeeAmount
      const netAmount = record.kind === 'yield-deposit' ? meta.amount + fee : meta.amount - fee
      const estimated = 'amountIsEstimate' in meta && meta.amountIsEstimate === true
      return { model: 'yield', headline: txHeadline(record), fee, netAmount, apyBps: meta.apyBps ?? null, estimated }
    }
    case 'consolidate': {
      // A consolidation merges the wallet's own notes, so `meta.amount` is 0n and the only USDC that leaves the
      // wallet is the relayer fee — that's what the headline shows.
      const fee = (record.meta as MetaFor<'consolidate'>).broadcasterFeeAmount
      return { model: 'merge', headline: txHeadline(record), fee }
    }
    case 'transfer-shielded-received':
      return { model: 'received', headline: txHeadline(record) }
  }
}

/**
 * `txFigures` for a caller that knows which summary layout it renders (e.g. the vault confirmation screen):
 * returns that shape, and throws if the record's kind maps to another — a caller bug, which a cast would
 * turn into silently misread figures.
 */
export function txFiguresAs<M extends TxFigures['model']>(record: TxFiguresSource, model: M): Extract<TxFigures, { model: M }> {
  const figures = txFigures(record)
  if (figures.model !== model) {
    throw new Error(`txFiguresAs: ${record.kind} has ${figures.model} figures, not ${model}`)
  }
  return figures as Extract<TxFigures, { model: M }>
}

/** The stage at which a cross-chain tx's source burn confirmed — money has left once it's reached, delivery or not. */
const SOURCE_BURN_STAGE: Partial<Record<TxKind, string>> = {
  'shield-xchain': 'client-burn-confirmed',
  'unshield-xchain': 'hub-burn-confirmed',
}

/**
 * Whether a record moved (or may have moved) money — false only when it definitively failed or was cancelled before
 * its first on-chain transaction confirmed, so its receipt shows no fees or totals (spec G-9). A single-transaction
 * kind's one transaction never confirmed (or reverted, taking everything with it); a cross-chain kind that reached its
 * source burn did move the amount + fees, even if the delivery then failed. An indeterminate outcome (expired, timed
 * out, dismissed) may have settled, and a draft or in-flight record hasn't finished, so those count as moved.
 */
export function moneyMoved(record: TxFiguresSource & Partial<Pick<TxRecord, 'executionState' | 'artifacts' | 'stagesCompleted'>>): boolean {
  if (record.executionState === undefined || record.artifacts === undefined) return true
  const outcome = txOutcome({ executionState: record.executionState, artifacts: record.artifacts })
  if (outcome !== 'failed' && outcome !== 'cancelled') return true
  const burnStage = SOURCE_BURN_STAGE[record.kind]
  return burnStage !== undefined && (record.stagesCompleted as readonly string[] | undefined)?.includes(burnStage) === true
}
