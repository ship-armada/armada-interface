// ABOUTME: SDK-backed shielded-transfer builder — planTransfer → prove → toTransactionData → buildTransactCalldata,
// ABOUTME: returning the raw { to, data } the handler submits. The @armada/sdk analogue of lib/shielded/transfer.ts.

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
 * spendable notes, proves it (Groth16), and the proved struct is serialized into `transact(...)`
 * calldata. Returns `{ to, data }` (value is always 0 — a shielded tx carries no native value).
 *
 * Proving runs on the instance's off-thread worker prover. Returns `{ to, data }` for the caller to submit.
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

  const plan = await wallet.planTransfer({
    outputs: [{ to0zk: inputs.recipient, amount: inputs.amount }],
    fee,
  })
  // Pre-proof gate: reject a stale root / already-spent input in <1s instead of proving for ~30s and
  // reverting on-chain. Throws a typed ArmadaError the handler's classifier maps to PRE_FLIGHT_REVERT.
  await assertSpendPreflight(wallet, plan)
  // Stash the plan so the handler can mark its inputs pending after broadcast (#55). After preflight
  // so an already-spent-input build never leaves a stale hold.
  if (inputs.recordId !== undefined) stashSpendPlan(inputs.recordId, plan)
  const handle = await wallet.prove(plan, {
    ...(inputs.onProgress ? { onProgress: (p) => inputs.onProgress?.(p.fraction) } : {}),
    ...(inputs.selfMetadata ? { selfMetadata: inputs.selfMetadata } : {}),
  })
  const { to, data } = buildTransactCalldata([handle.toTransactionData()], inputs.poolAddress)
  return { to, data }
}
