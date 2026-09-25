// ABOUTME: Display fee breakdown for action flows — on-chain protocol (USDC) + native gas estimate.
// ABOUTME: Used for amount-card tooltips, review summaries, and max-fill.

import type { FeeSchedule } from '@/lib/relayer'
import { userFeeForKind } from '@/lib/relayer'
import type { MetaShield, MetaShieldXchain, MetaYieldDeposit, MetaYieldWithdraw, TxKind } from '@/lib/tx/types'

export interface NativeGasEstimate {
  wei: bigint
  symbol: string
  formatted: string
}

/**
 * The native-gas estimate as a compact approximate amount, e.g. "~0.0012 ETH" — trimmed to 4
 * decimals. Shared by the amount-card fee caption and the breakdown tooltip so the two never
 * disagree on the figure. The `~` conveys "estimate" (gas units × current price, not a quote).
 */
export function formatNativeGasAmount(gas: NativeGasEstimate): string {
  const trimmed = gas.formatted.replace(/(\.\d{4})\d+$/, '$1')
  return `~${trimmed} ${gas.symbol}`
}

export interface DisplayFees {
  /** USDC protocol fee (shield fee module or CCTP bps) — deducted from deposit amount when inclusive. */
  protocolFee: bigint
  /** @deprecated Use nativeGas — kept 0 for wallet-submitted flows. */
  gasFee: bigint
  /** Estimated network gas paid in native token from the user's wallet. */
  nativeGas: NativeGasEstimate | null
  /** USDC fees shown in the amount-card FEE row (protocol only today). */
  totalFee: bigint
  /** When true, fee is taken from the entered amount; max spend = full balance. */
  feeInclusive: boolean
}

type RelayerFeeKey = keyof FeeSchedule['fees']

export function relayerFeeKeyForKind(kind: TxKind): RelayerFeeKey {
  switch (kind) {
    case 'shield-xchain':
      return 'crossChainShield'
    case 'unshield-xchain':
      return 'crossChainUnshield'
    case 'shield':
    case 'yield-deposit':
    case 'yield-withdraw':
      return 'crossContract'
    case 'unshield-local':
      return 'unshield'
    case 'transfer-shielded':
    case 'consolidate':
      return 'transfer'
    case 'transfer-shielded-received':
      // Synthetic received-transfer records are reconstructed from chain and never submitted, so
      // they carry no relayer fee. Reaching here means a received record was fed into fee logic —
      // a caller bug. Throw rather than invent a fee key.
      throw new Error('relayerFeeKeyForKind: received transfers carry no relayer fee')
  }
}

/** Relayer USDC reimbursement — not charged to users until submitRelay ships. */
export function relayerGasFeeForKind(_kind: TxKind, _quote: FeeSchedule | null): bigint {
  return 0n
}

/**
 * The base the protocol shield fee (PrivacyPool's ~50 bps take) is charged on. The pool shields only
 * the amount that reaches it after upstream carve-outs, so estimating the fee on the full deposit
 * over-states it (double-counting the fee on the carved-out portions) and under-reports what the user
 * receives:
 *  - same-chain gasless shield: the relayer fee is carved out first as its own note → base `amount - relayerFee`.
 *  - shield-xchain: the CCTP mint deducts its fee first, then (gasless) the relayer fee → base
 *    `amount - relayerFee - cctpFee`.
 * Direct same-chain shield (no carve-out) uses the full `amount`.
 */
export function shieldProtocolFeeBase(
  kind: TxKind,
  amount: bigint,
  relayerFee: bigint,
  gasless: boolean,
  cctpFee: bigint = 0n,
): bigint {
  if (kind === 'shield' && gasless) return amount > relayerFee ? amount - relayerFee : amount
  if (kind === 'shield-xchain') {
    const carved = relayerFee + cctpFee
    return amount > carved ? amount - carved : amount
  }
  return amount
}

/**
 * Derive a shield's confirmed receipt figures (gross amount, total fee, net received) from its stored
 * `meta`. The note that lands = `amount − relayerFee − protocolFee − cctpFee`: the gasless wrapper
 * carves the relayer fee as its own note, the pool takes its ~50 bps shield fee, and (cross-chain) the
 * CCTP mint deducts its fee. `cctpFee` is only present on shield-xchain; both fee legs default to 0 on
 * pre-capture records. The SINGLE source of receipt math — used by both the completion screen and the
 * activity receipt so a completed shield reads identically wherever it's shown. Fee is `null` (renders
 * "—") when nothing was charged.
 */
export function shieldReceiptFromMeta(meta: MetaShield | MetaShieldXchain): {
  amount: bigint
  fee: bigint | null
  netAmount: bigint
} {
  const relayerFee = meta.feeAmount ?? 0n
  const cctpFee = 'cctpFee' in meta ? (meta.cctpFee ?? 0n) : 0n
  const totalFee = relayerFee + (meta.protocolFee ?? 0n) + cctpFee
  const netAmount = meta.amount > totalFee ? meta.amount - totalFee : meta.amount
  return { amount: meta.amount, fee: totalFee > 0n ? totalFee : null, netAmount }
}

/**
 * Derive a yield op's confirmed receipt figures (headline amount, fee, net) from its stored `meta`.
 * The broadcaster fee is the only fee leg on yield kinds (no CCTP; protocol fee is 0 on these ops).
 *   - deposit: `netAmount = amount + fee` (total debited from the private balance).
 *   - withdraw: `netAmount = amount - fee` (net received into the private balance; the fee is skimmed
 *     from the redeemed proceeds). `amount` is the redeemed gross — the handler reconciles it to the
 *     ACTUAL execution-rate value at completion, so a completed withdraw reads identically wherever
 *     it's shown (complete screen, activity receipt, post-recovery). The SINGLE source of yield
 *     receipt math — used by both the completion screen and the activity receipt.
 */
export function yieldReceiptFromMeta(
  meta: MetaYieldDeposit | MetaYieldWithdraw,
  kind: 'yield-deposit' | 'yield-withdraw',
): { amount: bigint; fee: bigint; netAmount: bigint } {
  const fee = meta.broadcasterFeeAmount
  const netAmount = kind === 'yield-deposit' ? meta.amount + fee : meta.amount - fee
  return { amount: meta.amount, fee, netAmount }
}

/**
 * Whether a yield withdrawal is too small to cover its own fee (→ block submit). The withdraw fee is
 * skimmed from the redeemed proceeds (contract-side re-shield to the relayer — see yield-sdk
 * `redeemAndShield`), NOT from the user's pre-existing private USDC, so the only uncoverable case is a
 * withdrawal whose amount doesn't exceed the fee: the redeem can't pay a fee larger than its proceeds
 * (it would revert) and a net-zero withdrawal is pointless. `feeTotal === 0` (no fee) is never
 * blocked.
 */
export function withdrawBelowFee(amount: bigint, feeTotal: bigint): boolean {
  return feeTotal > 0n && amount <= feeTotal
}

/** Base display fees; shield protocol fee is overridden in useDisplayFees via fee module. */
export function computeDisplayFees(
  kind: TxKind,
  amount: bigint,
  _quote: FeeSchedule | null,
): DisplayFees {
  const protocolFee = userFeeForKind(kind, amount)
  const feeInclusive =
    kind === 'shield' || kind === 'shield-xchain' || kind === 'unshield-xchain'
  return {
    protocolFee,
    gasFee: 0n,
    nativeGas: null,
    totalFee: protocolFee,
    feeInclusive,
  }
}

/** @deprecated Use maxSpendableAmount from useDisplayFees.ts */
export function maxInputAmount(balance: bigint, totalFee: bigint): bigint {
  return balance > totalFee ? balance - totalFee : 0n
}

/**
 * Derive a send / unshield's confirmed receipt figures from its stored `meta` — the fee actually charged
 * (`broadcasterFeeAmount`, recorded at build: a fragmented wallet's split send pays one per-proof fee per
 * proof) rather than the live quote, which prices one proof and keeps refreshing after submit. The shown
 * fee adds the protocol / CCTP fees; the total deducted is fee-on-top (`amount + broadcaster fee`), since
 * those two come out of the recipient's side, not the shielded balance. Mirrors the Activity receipt.
 */
export function spendReceiptFromMeta(
  meta: { amount: bigint; broadcasterFeeAmount: bigint },
  extras: { protocolFee: bigint; cctpFee: bigint },
): { fee: bigint; totalDeducted: bigint } {
  return {
    fee: meta.broadcasterFeeAmount + extras.protocolFee + extras.cctpFee,
    totalDeducted: meta.amount + meta.broadcasterFeeAmount,
  }
}
