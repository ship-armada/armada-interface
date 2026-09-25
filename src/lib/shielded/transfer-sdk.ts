// ABOUTME: SDK-backed shielded-transfer builder — planTransfer → proveAll → buildTransactCalldata([...]), plus the
// ABOUTME: review-time fee planning (planTransferFee / maxTransferAmount) that prices a split transfer before proving.

import { buildTransactCalldata } from '@armada/sdk'
import { getSdkWallet } from './sdk-read'
import { assertSpendPreflight } from './preflight'
import { stashSpendPlan } from './pending-spend'
import { SpendFeeIncreasedError } from './spend-fee-error'
import { assertReviewedFee, totalFeeOf } from './spend-fee'

export { SpendFeeIncreasedError }

/** The relayer's per-proof fee and its 0zk address, or null for direct submission (no fee note). */
export type BroadcasterFee = { readonly amount: bigint; readonly recipientAddress: string } | null

export interface SdkTransferInputs {
  /** 0zk recipient of the transfer. */
  readonly recipient: string
  readonly amount: bigint
  /** Broadcaster (relayer) per-proof fee + 0zk address, or null for direct user submission (no fee output).
   *  A split transfer pays `amount` once per proof. */
  readonly broadcasterFee: BroadcasterFee
  /** The total fee the user reviewed. The build refuses (`SpendFeeIncreasedError`) if planning now
   *  charges more — e.g. a sync fragmented the wallet into more proofs since review. Omit to skip. */
  readonly maxTotalFee?: bigint
  readonly poolAddress: `0x${string}`
  /** ZK-proof progress (0–1); the worker prover emits coarse start/end phases. */
  readonly onProgress?: (fraction: number) => void
  /** Tx `record.id` — when set, the built plans are stashed so the handler can `markSpendPending`
   *  their inputs after broadcast (armada-sdk #55 in-flight double-spend guard). */
  readonly recordId?: string
  /** Opaque metadata blob persisted in the spend's change note (armada-sdk #88 lever 3), recovered
   *  on a fresh chain scan. Encoded by the handler via `lib/shielded/selfMetadata`. */
  readonly selfMetadata?: string
}

/**
 * Build a shielded-transfer transaction via `@armada/sdk`: the wallet plans the transfer over its
 * spendable notes as one or more supported-shape groups, proves every group (`proveAll`, one signing
 * ceremony), and serializes all proved structs into ONE `transact([...])` calldata. A fragmented wallet
 * that no single circuit shape can cover is split across groups (recipient receives multiple notes) and
 * still settles in one atomic tx. Returns `{ to, data }` (value is always 0 — a shielded tx carries no
 * native value) and `totalFee`, the fee actually charged across all groups; proving runs on the
 * instance's off-thread worker prover.
 */
export async function buildTransferSdk(
  inputs: SdkTransferInputs,
): Promise<{ to: `0x${string}`; data: `0x${string}`; totalFee: bigint }> {
  const wallet = await getSdkWallet()
  // A fragmented wallet plans as MORE THAN ONE group (the SDK splits a transfer no single supported
  // circuit shape can cover); the recipient receives multiple notes and every group is submitted in one
  // atomic `transact([...])`. The common case is a single group. Throws `TooFragmentedError` when the
  // wallet is too fragmented for one batch (consolidate first) — surfaced to the user by the handler.
  const plans = await wallet.planTransfer(transferRequest(inputs.recipient, inputs.amount, inputs.broadcasterFee))
  const totalFee = totalFeeOf(plans)
  assertReviewedFee(totalFee, inputs.maxTotalFee)
  // Pre-proof gate over ALL groups in one batched preflight: reject a stale root / already-spent input
  // in <1s instead of proving for ~30s and reverting on-chain. Maps to PRE_FLIGHT_REVERT.
  await assertSpendPreflight(wallet, plans)
  // Stash the plan group(s) so the handler can mark ALL their inputs pending after broadcast (#55).
  // After preflight so an already-spent-input build never leaves a stale hold.
  if (inputs.recordId !== undefined) stashSpendPlan(inputs.recordId, plans)
  // proveAll signs EVERY group's intent in one signing ceremony (the batch rule) and fails fast on a
  // signer rejection BEFORE spending ~30s/group proving; selfMetadata rides the change note (last
  // group) and is ignored on groups with no change output. Its progress spans the whole batch.
  // Combine the proved txns into one atomic transact([...]).
  const handles = await wallet.proveAll(plans, {
    ...(inputs.onProgress ? { onProgress: (p) => inputs.onProgress?.(p.fraction) } : {}),
    ...(inputs.selfMetadata ? { selfMetadata: inputs.selfMetadata } : {}),
  })
  const { to, data } = buildTransactCalldata(handles.map((h) => h.toTransactionData()), inputs.poolAddress)
  return { to, data, totalFee }
}

/**
 * Price a transfer WITHOUT proving: plan it over the wallet's current notes and sum the fee notes. A
 * fragmented wallet splits into several proofs, each paying the per-proof fee, so this is the fee the
 * user must review. Planning reads only local scan state (no RPC), so it is cheap enough to run as the
 * amount changes. Throws the planner's typed errors (`TooFragmentedError`, `InsufficientBalanceError`, …).
 */
export async function planTransferFee(inputs: {
  readonly recipient: string
  readonly amount: bigint
  readonly broadcasterFee: BroadcasterFee
}): Promise<{ totalFee: bigint; proofs: number }> {
  const wallet = await getSdkWallet()
  const plans = await wallet.planTransfer(transferRequest(inputs.recipient, inputs.amount, inputs.broadcasterFee))
  return { totalFee: totalFeeOf(plans), proofs: plans.length }
}

/**
 * The largest amount the user can send privately right now, fee included — the Send flow's Max. The SDK
 * works it out with the planner's own rules: a send spends ONE tree's notes, a fragmented wallet's split
 * pays the per-proof fee once per proof, and one send can only spend what four proofs hold — so it can
 * be less than "balance minus a fee" (e.g. notes spread across trees), and `planTransfer` accepts it.
 * 0n when nothing can be sent.
 */
export async function maxTransferAmount(inputs: { readonly broadcasterFee: BroadcasterFee }): Promise<bigint> {
  const wallet = await getSdkWallet()
  return wallet.maxTransferAmount({ fee: feeQuoteFor(inputs.broadcasterFee) })
}

function transferRequest(recipient: string, amount: bigint, broadcasterFee: BroadcasterFee) {
  return { outputs: [{ to0zk: recipient, amount }], fee: feeQuoteFor(broadcasterFee) }
}

/**
 * The SDK fee quote for a per-proof broadcaster fee. The planners (`planTransfer`, `maxTransferAmount`,
 * `consolidate`) read only `schedule.transfer` + `broadcasterShieldedAddress`; `feesCacheId`/`expiresAt`
 * are part of the FeeQuote contract but unused here (the quote's staleness is the relayer's concern).
 */
export function feeQuoteFor(broadcasterFee: BroadcasterFee) {
  return broadcasterFee
    ? {
        schedule: { transfer: broadcasterFee.amount.toString() },
        broadcasterShieldedAddress: broadcasterFee.recipientAddress,
        feesCacheId: '',
        expiresAt: 0,
      }
    : { schedule: { transfer: '0' }, broadcasterShieldedAddress: '', feesCacheId: '', expiresAt: 0 }
}
