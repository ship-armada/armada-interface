// ABOUTME: useSpendCheck — dry-runs an unsplittable spend (unshield / vault op) at review, so a wallet too fragmented
// ABOUTME: for it is caught before anything is attempted and offered "Merge notes" instead of failing after Confirm.

import { useQuery } from '@tanstack/react-query'
import { checkSpendPlans } from '@/lib/shielded/consolidate-sdk'
import { mergeTokenAddress } from '@/lib/shielded/sdk-read'
import { blockedSpendRequest, type BlockedSpend, type MergeToken } from '@/lib/shielded/merge-intent'
import { classifyHandlerError } from '@/lib/tx/errors'

export interface UseSpendCheckArgs {
  /** Check only on the review step (the amount is final there). */
  readonly enabled: boolean
  /** The spend the review would submit; null when there's nothing to check. */
  readonly spend: BlockedSpend | null
  /** The token it spends (USDC, or vault shares for a withdrawal). */
  readonly token: MergeToken
  /** Changes whenever the wallet's balances do, so the check follows the wallet's notes. */
  readonly balanceKey: string
}

export interface SpendCheck {
  /** Why the spend can't be made as the wallet stands — set only when merging notes would fix it. */
  readonly error: string | null
  readonly remedy: 'merge-notes' | null
  /** True while the check runs — the review holds Confirm, so a quick click can't slip past it. */
  readonly pending: boolean
  /** "Checking your notes…" while the check runs (the review holds Confirm). Fragmentation isn't a
   *  blockReason: the review shows its "Too many small notes" callout for `remedy` and holds Confirm itself. */
  readonly blockReason: string | null
}

const CHECKING = 'Checking your notes…'
const CLEAR: SpendCheck = { error: null, remedy: null, pending: false, blockReason: null }

/**
 * Plan the spend without proving (local, no RPC) and report it ONLY when the wallet is too fragmented for
 * it — the one failure the review step can fix in-app (a merge). Anything else (a transient read error, a
 * balance issue the flow already guards) is ignored here: the real build still reports it, so this check
 * can never wrongly block Confirm.
 */
export function useSpendCheck(args: UseSpendCheckArgs): SpendCheck {
  const { spend } = args
  const active = args.enabled && spend !== null && spend.amount > 0n
  const query = useQuery({
    // Query keys must be JSON-serialisable, so bigints go in as strings.
    queryKey: [
      'spend-check', args.token, spend?.kind, spend?.amount.toString(), spend?.perProofFee.toString(), args.balanceKey,
    ],
    queryFn: async (): Promise<SpendCheck> => {
      const tokenAddress = await mergeTokenAddress(args.token)
      if (tokenAddress === undefined) return CLEAR
      try {
        await checkSpendPlans(blockedSpendRequest(spend!, tokenAddress))
        return CLEAR
      } catch (err) {
        const classified = classifyHandlerError(err, '')
        return classified.remedy === 'merge-notes'
          ? { error: classified.message, remedy: 'merge-notes', pending: false, blockReason: null }
          : CLEAR
      }
    },
    enabled: active,
    retry: false,
    staleTime: Infinity,
  })
  if (!active) return CLEAR
  if (query.isFetching || query.data === undefined) return { ...CLEAR, pending: true, blockReason: CHECKING }
  return query.data
}
