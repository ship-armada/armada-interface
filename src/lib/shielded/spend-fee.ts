// ABOUTME: A spend's fee as its plans charge it (the sum of their broadcaster fee notes), the reviewed-fee cap every spend
// ABOUTME: builder applies before proving (SpendFeeIncreasedError), and what the plans return to the wallet (returnsToSelfOf).

import type { Plan } from '@armada/sdk'
import { SpendFeeIncreasedError } from './spend-fee-error'

/**
 * The fee actually charged across a spend's groups: the sum of their broadcaster fee notes. It can be more
 * than the per-proof quote — a split transfer or a merge pays it once per proof, and a spend blocked only by
 * a small change note pays that change with its fee (the SDK folds it in rather than split or refuse).
 */
export function totalFeeOf(plans: readonly Pick<Plan, 'summary'>[]): bigint {
  return plans.reduce((sum, p) => sum + (p.summary.feeOutput?.value ?? 0n), 0n)
}

/**
 * What a spend's groups return to the wallet: each plan's change plus any output to the wallet's own 0zk (a send to
 * yourself, a merge), in the spent token. Exact at build — the dashboard shows it as part of the balance while the SDK
 * holds the spend's inputs (3B), so the balance after a send shows at broadcast rather than once it's scanned.
 */
export function returnsToSelfOf(plans: readonly Pick<Plan, 'summary'>[], ownShieldedAddress: string): bigint {
  return plans.reduce(
    (sum, p) =>
      sum +
      p.summary.changeValue +
      p.summary.outputs.filter((o) => o.toShieldedAddress === ownShieldedAddress).reduce((s, o) => s + o.value, 0n),
    0n,
  )
}

/**
 * Refuse, before anything is proved, a spend whose fee exceeds the fee the user reviewed (`maxTotalFee`;
 * undefined skips the check). The wallet's notes can change between review and build (a sync landed), and
 * with them how many proofs the spend needs or whether its change is folded into the fee.
 */
export function assertReviewedFee(totalFee: bigint, maxTotalFee: bigint | undefined): void {
  if (maxTotalFee !== undefined && totalFee > maxTotalFee) throw new SpendFeeIncreasedError(maxTotalFee, totalFee)
}
