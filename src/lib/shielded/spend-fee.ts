// ABOUTME: A spend's fee as its plans charge it (the sum of their broadcaster fee notes), and the reviewed-fee cap
// ABOUTME: every spend builder applies before proving — SpendFeeIncreasedError when the plan charges more.

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
 * Refuse, before anything is proved, a spend whose fee exceeds the fee the user reviewed (`maxTotalFee`;
 * undefined skips the check). The wallet's notes can change between review and build (a sync landed), and
 * with them how many proofs the spend needs or whether its change is folded into the fee.
 */
export function assertReviewedFee(totalFee: bigint, maxTotalFee: bigint | undefined): void {
  if (maxTotalFee !== undefined && totalFee > maxTotalFee) throw new SpendFeeIncreasedError(maxTotalFee, totalFee)
}
