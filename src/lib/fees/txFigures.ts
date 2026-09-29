// ABOUTME: txFigures — every money figure a tx surface shows after submit (Confirm, Activity row + receipt, a receipt
// ABOUTME: recovered from chain), derived from the record alone. The single source of receipt math; spec: specs/TX_VALUES.md.

import type { TxRecord } from '@/lib/tx/types'

/**
 * The figures a record is shown with, shaped per summary layout:
 *  - `deposit` (shield, shield-xchain): fee-inclusive — the net received is `amount − fees`.
 *  - `spend` (transfer-shielded, unshield-*): fee-on-top — the total deducted is `amount + relayer fee`.
 *  - `yield` (yield-deposit, yield-withdraw): the per-tab net — deposit debits `amount + fee`, withdraw nets `amount − fee`.
 *  - `merge` (consolidate): moves no value — the fee is both the headline and the only charge.
 *  - `received` (transfer-shielded-received): the amount credited; the recipient pays no fee.
 * `headline` is the big numeral and the Activity row's magnitude (the row adds the sign by direction).
 */
export type TxFigures =
  | { model: 'deposit'; headline: bigint; fee: bigint | null; netAmount: bigint }
  | { model: 'spend'; headline: bigint; fee: bigint; totalDeducted: bigint }
  | { model: 'yield'; headline: bigint; fee: bigint; netAmount: bigint }
  | { model: 'merge'; headline: bigint; fee: bigint }
  | { model: 'received'; headline: bigint }

/**
 * The figure a record is summarised by — the receipt's big numeral and the Activity row's magnitude: its
 * `meta.amount`, except a consolidation, which moves no value (amount 0) and is shown by the fee it paid.
 * Reads only what the headline is made of, so a list row renders even for a record whose fee fields are absent.
 */
export function txHeadline(record: TxRecord): bigint {
  if (record.kind === 'consolidate') return (record as TxRecord<'consolidate'>).meta.broadcasterFeeAmount
  return record.meta.amount
}

/** The figures every post-submit surface renders for `record` — so a tx reads identically wherever it's shown. */
export function txFigures(record: TxRecord): TxFigures {
  switch (record.kind) {
    case 'shield':
    case 'shield-xchain': {
      // The note that lands = `amount − relayerFee − protocolFee − cctpFee`: the gasless wrapper carves the relayer
      // fee as its own note, the pool takes its ~50 bps shield fee, and (cross-chain) the CCTP mint deducts its fee.
      // `cctpFee` is only present on shield-xchain; both fee legs default to 0 on pre-capture records. Fee is `null`
      // (renders "—") when nothing was charged.
      const meta = (record as TxRecord<'shield' | 'shield-xchain'>).meta
      const relayerFee = meta.feeAmount ?? 0n
      const cctpFee = 'cctpFee' in meta ? (meta.cctpFee ?? 0n) : 0n
      const totalFee = relayerFee + (meta.protocolFee ?? 0n) + cctpFee
      const netAmount = meta.amount > totalFee ? meta.amount - totalFee : meta.amount
      return { model: 'deposit', headline: txHeadline(record), fee: totalFee > 0n ? totalFee : null, netAmount }
    }
    case 'transfer-shielded':
    case 'unshield-local':
    case 'unshield-xchain': {
      // The fee is what was actually charged (`broadcasterFeeAmount`, recorded at build: a fragmented wallet's split
      // send pays one per-proof fee per proof) plus the protocol / CCTP fees recorded at review; the total deducted
      // is fee-on-top (`amount + broadcaster fee`), since those two come out of the recipient's side, not the
      // shielded balance. Records written before the protocol / CCTP fees were stored show the broadcaster fee alone.
      const meta = (record as TxRecord<'transfer-shielded' | 'unshield-local' | 'unshield-xchain'>).meta
      const protocolFee = 'protocolFee' in meta ? (meta.protocolFee ?? 0n) : 0n
      const cctpFee = 'cctpFee' in meta ? (meta.cctpFee ?? 0n) : 0n
      return {
        model: 'spend',
        headline: txHeadline(record),
        fee: meta.broadcasterFeeAmount + protocolFee + cctpFee,
        totalDeducted: meta.amount + meta.broadcasterFeeAmount,
      }
    }
    case 'yield-deposit':
    case 'yield-withdraw': {
      // The broadcaster fee is the only fee leg on yield kinds (no CCTP; protocol fee is 0 on these ops).
      //   - deposit: `netAmount = amount + fee` (total debited from the private balance).
      //   - withdraw: `netAmount = amount - fee` (net received into the private balance; the fee is skimmed from the
      //     redeemed proceeds). `amount` is the redeemed gross — the handler reconciles it to the ACTUAL
      //     execution-rate value at completion, so a completed withdraw reads identically wherever it's shown.
      const meta = (record as TxRecord<'yield-deposit' | 'yield-withdraw'>).meta
      const fee = meta.broadcasterFeeAmount
      const netAmount = record.kind === 'yield-deposit' ? meta.amount + fee : meta.amount - fee
      return { model: 'yield', headline: txHeadline(record), fee, netAmount }
    }
    case 'consolidate': {
      // A consolidation merges the wallet's own notes, so `meta.amount` is 0n and the only USDC that leaves the
      // wallet is the relayer fee — that's what the headline shows.
      const fee = (record as TxRecord<'consolidate'>).meta.broadcasterFeeAmount
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
export function txFiguresAs<M extends TxFigures['model']>(record: TxRecord, model: M): Extract<TxFigures, { model: M }> {
  const figures = txFigures(record)
  if (figures.model !== model) {
    throw new Error(`txFiguresAs: ${record.kind} has ${figures.model} figures, not ${model}`)
  }
  return figures as Extract<TxFigures, { model: M }>
}
