// ABOUTME: Optimistic in-flight spend bridge (armada-sdk #55) — stashes a spend's Plan at build time
// ABOUTME: and marks its inputs pending after broadcast so a rapid follow-up spend won't reselect them.

import { type Plan } from '@armada/sdk'
import { getSdkWallet } from './sdk-read'
import { trackError } from '../telemetry'

// Module-scope stash of the in-flight Plan, keyed by the tx `record.id`. Deliberately NOT persisted:
// the Plan is an in-memory object (not serializable), and the double-spend race it guards against only
// exists within a live session — after a reload the scan has advanced past the window. Runs in the
// leader tab alongside the executor, so it shares that tab's SDK read instance.
// One entry per record; the value is the spend's group(s) — a fragmented transfer plans as >1 group,
// all spent by the same atomic tx, so all their inputs must be held under the one broadcast txid.
const pendingPlans = new Map<string, Plan[]>()

/** Stash a freshly-built spend's plan group(s) so their inputs can be marked pending after broadcast. */
export function stashSpendPlan(recordId: string, plans: Plan[]): void {
  pendingPlans.set(recordId, plans)
}

/** Drop a stashed Plan without marking (e.g. the build never reached broadcast). Idempotent. */
export function forgetSpendPlan(recordId: string): void {
  pendingPlans.delete(recordId)
}

/**
 * After broadcasting a spend, mark its input notes as optimistically spent (armada-sdk #55) keyed by
 * the on-chain `txid`, so a rapid follow-up `planTransfer` won't reselect them (which would revert
 * with "Note already spent"). The hold clears automatically on the `Nullified` event, via
 * `clearSpendPendingForTx` on a known drop/revert, or by the SDK's TTL. No-op when no Plan was stashed
 * (resumed tx, or a non-spend kind). Best-effort: never throws — a failed mark must not fail the tx.
 */
export async function markSpendPendingForRecord(recordId: string, txid: string): Promise<void> {
  const plans = pendingPlans.get(recordId)
  if (plans === undefined) return
  pendingPlans.delete(recordId)
  try {
    const wallet = await getSdkWallet()
    // Hold every group's inputs in one call so a split spend can't leave later groups' notes unheld.
    wallet.markSpendPending(plans, txid)
  } catch (err) {
    trackError('shielded.pendingSpend.mark', err)
  }
}

/**
 * Release the optimistic holds for a spend that will not confirm (dropped / reverted tx), so its notes
 * become spendable again immediately instead of waiting out the TTL. Best-effort: never throws.
 */
export async function clearSpendPendingForTx(txid: string): Promise<void> {
  try {
    const wallet = await getSdkWallet()
    wallet.clearSpendPending(txid)
  } catch (err) {
    trackError('shielded.pendingSpend.clear', err)
  }
}
