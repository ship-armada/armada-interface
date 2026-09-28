// ABOUTME: SDK-backed unshield builder — planTransfer(unshield) → prove → toTransactionData → buildTransactCalldata,
// ABOUTME: returning the raw { to, data } the handler submits; plus the unshield flows' Max (maxUnshieldAmount).

import { buildTransactCalldata } from '@armada/sdk'
import { getSdkWallet } from './sdk-read'
import { assertSpendPreflight } from './preflight'
import { stashSpendPlan } from './pending-spend'
import { assertReviewedFee, totalFeeOf } from './spend-fee'

export interface SdkUnshieldInputs {
  /** EVM recipient of the unshielded USDC — funds leave the pool to this address. */
  readonly recipient: `0x${string}`
  readonly amount: bigint
  /** Broadcaster (relayer) fee note, or null for direct user submission (no fee output). */
  readonly broadcasterFee: { readonly amount: bigint; readonly recipientAddress: string } | null
  /** The total fee the user reviewed. The build refuses (`SpendFeeIncreasedError`) if planning now charges
   *  more — e.g. a sync moved the notes so the change can no longer be folded into the fee. Omit to skip. */
  readonly maxTotalFee?: bigint
  readonly poolAddress: `0x${string}`
  /** ZK-proof progress (0–1); the worker prover emits coarse start/end phases. */
  readonly onProgress?: (fraction: number) => void
  /** Tx `record.id` — when set, the built Plan is stashed so the handler can `markSpendPending`
   *  its inputs after broadcast (armada-sdk #55 in-flight double-spend guard). */
  readonly recordId?: string
  /** Opaque metadata blob persisted in the spend's change note (armada-sdk #88 lever 3), recovered
   *  on a fresh chain scan. Encoded by the handler via `lib/shielded/selfMetadata`. */
  readonly selfMetadata?: string
}

/**
 * Build an unshield transaction via `@armada/sdk`: the wallet plans a transfer whose only public
 * output is the unshield (recipient EVM address, no shielded outputs), proves it (Groth16), and the
 * proved struct is serialized into `transact(...)` calldata. Returns `{ to, data }` (value is always
 * 0 — a shielded tx carries no native value; the USDC is paid out from the pool).
 *
 * The unshield is modelled inside `planTransfer` as `{ recipient, amount }` — the last output
 * commitment (a public `UnshieldNoteERC20`, npk = recipient), which the contract pays out on. No
 * shielded recipients, so `outputs` is empty; the broadcaster fee (when present) is the only shielded
 * output. Proving runs on the instance's worker prover. Also returns `totalFee`, the fee the plan
 * actually charges (the per-proof fee, plus any small change the SDK folded into it).
 */
export async function buildUnshieldSdk(
  inputs: SdkUnshieldInputs,
): Promise<{ to: `0x${string}`; data: `0x${string}`; totalFee: bigint }> {
  const wallet = await getSdkWallet()
  // planTransfer reads only `schedule.transfer` + `broadcasterShieldedAddress`; `feesCacheId`/`expiresAt`
  // are part of the FeeQuote contract but unused here (the quote's staleness is the relayer's concern).
  const fee = inputs.broadcasterFee
    ? {
        schedule: { transfer: inputs.broadcasterFee.amount.toString() },
        broadcasterShieldedAddress: inputs.broadcasterFee.recipientAddress,
        feesCacheId: '',
        expiresAt: 0,
      }
    : { schedule: { transfer: '0' }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 }

  // Unshields aren't split (the SDK's planSpend only splits plain single-recipient transfers), so this
  // is exactly one group. A shape the deployment can't prove surfaces as UnsupportedCircuitShapeError.
  const plans = await wallet.planTransfer({
    outputs: [],
    unshield: { recipient: inputs.recipient, amount: inputs.amount },
    fee,
  })
  const plan = plans[0]
  if (plans.length !== 1 || !plan) throw new Error('unshield: expected a single plan group')
  const totalFee = totalFeeOf(plans)
  assertReviewedFee(totalFee, inputs.maxTotalFee)
  // Pre-proof gate: reject a stale root / already-spent input in <1s instead of proving for ~30s and
  // reverting on-chain. Throws a typed ArmadaError the handler's classifier maps to PRE_FLIGHT_REVERT.
  await assertSpendPreflight(wallet, plan)
  // Stash the plan so the handler can mark its inputs pending after broadcast (#55). After preflight
  // so an already-spent-input build never leaves a stale hold.
  if (inputs.recordId !== undefined) stashSpendPlan(inputs.recordId, plans)
  const handle = await wallet.prove(plan, {
    ...(inputs.onProgress ? { onProgress: (p) => inputs.onProgress?.(p.fraction) } : {}),
    ...(inputs.selfMetadata ? { selfMetadata: inputs.selfMetadata } : {}),
  })
  const { to, data } = buildTransactCalldata([handle.toTransactionData()], inputs.poolAddress)
  return { to, data, totalFee }
}

/**
 * The largest amount the user can unshield right now, fee included — the unshield flows' Max (a vault
 * deposit is an unshield to the adapter, so it shares it). The SDK works it out with the planner's own
 * rules: an unshield never splits, so it's what ONE proof can spend from ONE tree, less one per-proof fee
 * — which can be less than "balance minus a fee" (e.g. many small notes, or notes spread across trees),
 * and `planTransfer` accepts it. 0n when nothing can be unshielded.
 */
export async function maxUnshieldAmount(inputs: { readonly perProofFee: bigint }): Promise<bigint> {
  const wallet = await getSdkWallet()
  // The fee tier is chosen here, so it rides in `schedule.transfer` (the tier the SDK falls back to).
  return wallet.maxUnshieldAmount({
    fee: { schedule: { transfer: inputs.perProofFee.toString() }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 },
  })
}
