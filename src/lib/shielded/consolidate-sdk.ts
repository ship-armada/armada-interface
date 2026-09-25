// ABOUTME: SDK-backed consolidation builder — wallet.consolidate → reviewed-fee cap → batched preflight → proveAll
// ABOUTME: → one transact([...]) merging a fragmented token's notes; plus the no-proving review preview + spend dry runs.

import { ArmadaError, buildTransactCalldata, type Plan, type PlanTransferRequest } from '@armada/sdk'
import { getSdkWallet } from './sdk-read'
import { assertSpendPreflight } from './preflight'
import { stashSpendPlan } from './pending-spend'
import { SpendFeeIncreasedError } from './spend-fee-error'
import { feeQuoteFor, totalFeeOf, type BroadcasterFee } from './transfer-sdk'

export interface SdkConsolidateInputs {
  /** The ONE token to merge (USDC or vault shares). */
  readonly tokenAddress: `0x${string}`
  /** Relayer per-proof fee + 0zk address; every proof in the merge pays it (in USDC). */
  readonly broadcasterFee: BroadcasterFee
  /** The total fee the user reviewed. The build refuses (`SpendFeeIncreasedError`) to charge more. */
  readonly maxTotalFee?: bigint
  readonly poolAddress: `0x${string}`
  /** ZK-proof progress (0–1) across every proof in the merge. */
  readonly onProgress?: (fraction: number) => void
  /** Tx `record.id` — stashes the plans so the handler can mark their inputs pending after broadcast (#55). */
  readonly recordId?: string
  /** Self-metadata blob for the merged notes (tags the merge so a chain rescan recovers it as one). */
  readonly selfMetadata?: string
}

/** What a consolidation does: its fee and proofs, and the consolidated token's notes in → out. */
export interface ConsolidationSummary {
  /** Total fee across every proof (USDC). */
  readonly totalFee: bigint
  readonly proofs: number
  /** The token's notes the merge spends. */
  readonly notesMerged: number
  /** The token's notes it leaves in their place. */
  readonly notesCreated: number
}

/**
 * Build a consolidation via `@armada/sdk`: `wallet.consolidate` plans the merge (old-tree notes first, then
 * the smallest; up to 4 proofs, one per-proof fee each), then one batched preflight, `proveAll` (one signing
 * batch), and a single atomic `transact([...])`. Throws the SDK's typed errors (`NothingToConsolidateError`
 * when nothing is worth merging, `InsufficientBalanceError` when a non-USDC merge can't pay its USDC fee).
 */
export async function buildConsolidateSdk(
  inputs: SdkConsolidateInputs,
): Promise<{ to: `0x${string}`; data: `0x${string}` } & Omit<ConsolidationSummary, 'proofs'>> {
  const wallet = await getSdkWallet()
  const plans = await wallet.consolidate({ tokenAddress: inputs.tokenAddress, fee: feeQuoteFor(inputs.broadcasterFee) })
  const { totalFee, notesMerged, notesCreated } = summarize(plans, inputs.tokenAddress)
  if (inputs.maxTotalFee !== undefined && totalFee > inputs.maxTotalFee) {
    throw new SpendFeeIncreasedError(inputs.maxTotalFee, totalFee)
  }
  // Pre-proof gate over every group: reject a stale root / already-spent input in <1s, not after proving.
  await assertSpendPreflight(wallet, plans)
  // Stash after preflight so an already-spent-input build never leaves a stale hold (#55).
  if (inputs.recordId !== undefined) stashSpendPlan(inputs.recordId, plans)
  const handles = await wallet.proveAll(plans, {
    ...(inputs.onProgress ? { onProgress: (p) => inputs.onProgress?.(p.fraction) } : {}),
    ...(inputs.selfMetadata ? { selfMetadata: inputs.selfMetadata } : {}),
  })
  const { to, data } = buildTransactCalldata(handles.map((h) => h.toTransactionData()), inputs.poolAddress)
  return { to, data, totalFee, notesMerged, notesCreated }
}

/**
 * Price a consolidation WITHOUT proving, for review. When `blocked` (the spend the user couldn't make) is
 * given, also dry-runs it against the wallet as it will be after the merge: `blockedWillWork` is false when
 * the planner would still refuse it (another round needed). Planning is local — no RPC.
 */
export async function previewConsolidation(inputs: {
  readonly tokenAddress: `0x${string}`
  readonly broadcasterFee: BroadcasterFee
  readonly blocked?: PlanTransferRequest
}): Promise<ConsolidationSummary & { blockedWillWork?: boolean }> {
  const wallet = await getSdkWallet()
  const plans = await wallet.consolidate({ tokenAddress: inputs.tokenAddress, fee: feeQuoteFor(inputs.broadcasterFee) })
  const summary = summarize(plans, inputs.tokenAddress)
  if (inputs.blocked === undefined) return summary
  try {
    await wallet.planTransferAfter(plans, inputs.blocked)
    return { ...summary, blockedWillWork: true }
  } catch (err) {
    // A planner refusal (shape / fragmentation / balance) means one merge isn't enough; anything else is a
    // real failure the caller should see.
    if (err instanceof ArmadaError) return { ...summary, blockedWillWork: false }
    throw err
  }
}

// The merge's fee + proofs, and the consolidated token's notes in → out (a USDC fee group isn't counted).
function summarize(plans: readonly Plan[], tokenAddress: `0x${string}`): ConsolidationSummary {
  const token = tokenAddress.toLowerCase()
  const merging = plans.filter((p) => p.summary.tokenAddress.toLowerCase() === token)
  return {
    totalFee: totalFeeOf(plans),
    proofs: plans.length,
    notesMerged: merging.reduce((n, p) => n + p.selectedInputs.length, 0),
    notesCreated: merging.filter((p) => p.summary.changeValue > 0n).length,
  }
}

/**
 * Dry-run a spend against the wallet's CURRENT notes — plan it (no merkle proofs, no proving, no RPC)
 * and throw the planner's typed error if it can't be made. Lets a review step catch a spend the wallet
 * is too fragmented for (unshields / vault ops never split) before anything is attempted.
 */
export async function checkSpendPlans(request: PlanTransferRequest): Promise<void> {
  const wallet = await getSdkWallet()
  // `planTransferAfter` with no merge plans over the notes as they are now.
  await wallet.planTransferAfter([], request)
}
