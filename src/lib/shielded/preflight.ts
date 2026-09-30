// ABOUTME: Pre-proof spend gate — runs wallet.preflight(plan) and throws the matching ArmadaError on a
// ABOUTME: failed finding, so a stale root / already-spent note fails in <1s instead of after a 30s proof+revert.

import { assertPreflight, type Plan, type PreflightResult } from '@armada/sdk'

/**
 * Run `wallet.preflight` over a planned spend BEFORE proving. On any failed finding, throw the matching
 * ArmadaError so the handler's `classifyHandlerError` renders a typed, category-appropriate failure
 * (PRE_FLIGHT_REVERT / FEE_EXPIRED) — the user gets a fast, honest "nothing was sent" instead of waiting
 * ~30s for a proof that reverts on-chain.
 *
 * Preflight is intentionally called WITHOUT a fee quote: quote staleness is the relayer's concern (it
 * re-verifies at submit), so the interface runs only the on-chain root-freshness + nullifier-unspent
 * checks here — the ones that turn a doomed proof into a sub-second failure. A transient RPC failure in
 * preflight itself surfaces as OTHER via the classifier and is retryable, same as it would be at submit.
 */
export async function assertSpendPreflight(
  wallet: { preflight(plan: Plan | readonly Plan[]): Promise<PreflightResult> },
  plan: Plan | readonly Plan[],
): Promise<void> {
  // A split transfer passes ALL its groups so preflight verifies every group's root + nullifiers in one
  // batched call (one PreflightResult over the union of findings).
  // The SDK maps the first failed finding to the ArmadaError the tx-error classifier
  // (`lib/tx/errors.ts::classifySdkError`) already understands: root-freshness → RootMismatchError,
  // nullifier-unspent → NoteAlreadySpentError, balance-sufficiency → InsufficientBalanceError, others →
  // InvalidRequestError. So a failed check reads the same pre-proof as it would thrown later by `prove`.
  assertPreflight(await wallet.preflight(plan))
}
