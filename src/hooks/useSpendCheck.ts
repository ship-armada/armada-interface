// ABOUTME: useSpendCheck — plans an unsplittable spend (unshield / vault op) at review without proving: the fee its
// ABOUTME: plan charges, a wallet too fragmented for it ("Merge notes" instead of failing after Confirm), and re-pricing at submit.

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { checkSpendPlans } from '@/lib/shielded/consolidate-sdk'
import { mergeTokenAddress } from '@/lib/shielded/sdk-read'
import { blockedSpendRequest, type BlockedSpend, type MergeToken } from '@/lib/shielded/merge-intent'
import { classifyHandlerError } from '@/lib/tx/errors'
import { useDebouncedValue } from './useDebouncedValue'

/** Planning reads only local scan state, but merkle-proof assembly still costs CPU — skip keystrokes. */
const AMOUNT_DEBOUNCE_MS = 250

const QUERY_KEY = 'spend-check'

export interface UseSpendCheckArgs {
  /** Check while the flow is on its amount / review steps. */
  readonly enabled: boolean
  /** The spend the review would submit; null when there's nothing to check. */
  readonly spend: BlockedSpend | null
  /** The token it spends (USDC, or vault shares for a withdrawal). */
  readonly token: MergeToken
  /** Changes whenever the wallet's balances do, so the check follows the wallet's notes. */
  readonly balanceKey: string
}

export interface SpendCheck {
  /**
   * The fee the spend's plan charges (its fee note), once planned: the per-proof fee, or more when the SDK
   * folds small change into it. 0 for a spend without a fee note (a vault withdrawal pays contract-side).
   * Null until planned, and when the spend can't be planned.
   */
  readonly fee: bigint | null
  /** Why the spend can't be made as the wallet stands (friendly copy); null when it can. */
  readonly error: string | null
  /** The in-app fix for `error`, when there is one (`merge-notes`: the wallet's notes are too fragmented). */
  readonly remedy: 'merge-notes' | null
  /** True while the check runs — the review holds Confirm, so a quick click can't slip past it. */
  readonly pending: boolean
  /** Why Confirm is held: "Checking your notes…" while the check runs, or the planner's reason. Fragmentation
   *  isn't a blockReason: the review shows its "Too many small notes" callout for `remedy` and holds Confirm itself. */
  readonly blockReason: string | null
  /** Re-plan the spend at a freshly quoted per-proof fee (submit time); resolves the fee it would charge. */
  priceAt(perProofFee: bigint): Promise<bigint>
  /** Drop cached checks so the spend is re-planned (e.g. a submit-time re-price disagreed with review). */
  invalidate(): Promise<void>
}

const CHECKING = 'Checking your notes…'

async function planFee(spend: BlockedSpend, token: MergeToken): Promise<bigint | null> {
  const tokenAddress = await mergeTokenAddress(token)
  if (tokenAddress === undefined) return null
  return (await checkSpendPlans(blockedSpendRequest(spend, tokenAddress))).totalFee
}

/**
 * Plan the spend without proving (local, no RPC) — as a private send's review plans its fee — so the review
 * shows the fee the build will actually charge (the SDK can fold small change into it), catches a wallet
 * too fragmented for the spend (offered "Merge notes"), and holds Confirm with the planner's reason for
 * anything else it refuses.
 */
export function useSpendCheck(args: UseSpendCheckArgs): SpendCheck {
  const queryClient = useQueryClient()
  const { spend, token } = args
  const debouncedAmount = useDebouncedValue(spend?.amount ?? 0n, AMOUNT_DEBOUNCE_MS)
  const active = args.enabled && spend !== null && spend.amount > 0n
  const query = useQuery({
    // Query keys must be JSON-serialisable, so bigints go in as strings.
    queryKey: [QUERY_KEY, token, spend?.kind, debouncedAmount.toString(), spend?.perProofFee.toString(), args.balanceKey],
    queryFn: () => planFee({ ...spend!, amount: debouncedAmount }, token),
    enabled: active && debouncedAmount > 0n,
    retry: false,
    staleTime: Infinity,
  })

  const priceAt = useCallback(
    async (perProofFee: bigint) => {
      if (spend === null) throw new Error('No spend to price.')
      const fee = await planFee({ ...spend, perProofFee }, token)
      if (fee === null) throw new Error('This token isn\'t available on this network.')
      return fee
    },
    [spend, token],
  )

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    [queryClient],
  )

  const inert = { fee: null, error: null, remedy: null, pending: false, blockReason: null, priceAt, invalidate }
  if (!active) return inert
  const settled = debouncedAmount === spend.amount && !query.isFetching
  if (!settled || (query.data === undefined && query.error === null)) {
    return { ...inert, pending: true, blockReason: CHECKING }
  }
  if (query.error) {
    const failure = classifyHandlerError(query.error, 'Could not work out the fee for this transaction.')
    return failure.remedy === 'merge-notes'
      ? { ...inert, error: failure.message, remedy: 'merge-notes' }
      : { ...inert, error: failure.message, blockReason: failure.message }
  }
  return { ...inert, fee: query.data ?? null }
}
