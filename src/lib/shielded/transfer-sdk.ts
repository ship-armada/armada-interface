// ABOUTME: SDK-backed shielded-transfer builder — planTransfer → prove EACH group → buildTransactCalldata([...]),
// ABOUTME: combining a (possibly split) fragmented transfer into one { to, data } the handler submits atomically.

import { buildTransactCalldata } from '@armada/sdk'
import { getSdkWallet } from './sdk-read'
import { assertSpendPreflight } from './preflight'
import { stashSpendPlan } from './pending-spend'

export interface SdkTransferInputs {
  /** 0zk recipient of the transfer. */
  readonly recipient: string
  readonly amount: bigint
  /** Broadcaster (relayer) fee note, or null for direct user submission (no fee output). */
  readonly broadcasterFee: { readonly amount: bigint; readonly recipientAddress: string } | null
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
 * Build a shielded-transfer transaction via `@armada/sdk`: the wallet plans the transfer over its
 * spendable notes as one or more supported-shape groups, proves every group (`proveAll`, one signing
 * ceremony), and serializes all proved structs into ONE `transact([...])` calldata. A fragmented wallet
 * that no single circuit shape can cover is split across groups (recipient receives multiple notes) and
 * still settles in one atomic tx. Returns `{ to, data }` (value is always 0 — a shielded tx carries no
 * native value); proving runs on the instance's off-thread worker prover.
 */
export async function buildTransferSdk(
  inputs: SdkTransferInputs,
): Promise<{ to: `0x${string}`; data: `0x${string}` }> {
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

  // A fragmented wallet plans as MORE THAN ONE group (the SDK splits a transfer no single supported
  // circuit shape can cover); the recipient receives multiple notes and every group is submitted in one
  // atomic `transact([...])`. The common case is a single group. Throws `TooFragmentedError` when the
  // wallet is too fragmented for one batch (consolidate first) — surfaced to the user by the handler.
  const plans = await wallet.planTransfer({
    outputs: [{ to0zk: inputs.recipient, amount: inputs.amount }],
    fee,
  })
  // Pre-proof gate over ALL groups in one batched preflight: reject a stale root / already-spent input
  // in <1s instead of proving for ~30s and reverting on-chain. Maps to PRE_FLIGHT_REVERT.
  await assertSpendPreflight(wallet, plans)
  // Stash the plan group(s) so the handler can mark ALL their inputs pending after broadcast (#55).
  // After preflight so an already-spent-input build never leaves a stale hold.
  if (inputs.recordId !== undefined) stashSpendPlan(inputs.recordId, plans)
  // proveAll signs EVERY group's intent in one signing ceremony (the batch rule) and fails fast on a
  // signer rejection BEFORE spending ~30s/group proving; selfMetadata rides the change note (last
  // group) and is ignored on groups with no change output. Combine the proved txns into one atomic
  // transact([...]).
  const handles = await wallet.proveAll(plans, {
    ...(inputs.onProgress ? { onProgress: (p) => inputs.onProgress?.(p.fraction) } : {}),
    ...(inputs.selfMetadata ? { selfMetadata: inputs.selfMetadata } : {}),
  })
  const { to, data } = buildTransactCalldata(handles.map((h) => h.toTransactionData()), inputs.poolAddress)
  return { to, data }
}
