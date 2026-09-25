// ABOUTME: useConsolidationPlan — prices a note merge at review time (planned through the SDK, no proving): its
// ABOUTME: fee, notes in → out, and whether the spend it was opened for works afterwards; re-prices at submit.

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { previewConsolidation, type ConsolidationSummary } from '@/lib/shielded/consolidate-sdk'
import { mergeTokenAddress } from '@/lib/shielded/sdk-read'
import { blockedSpendRequest, type MergeIntent } from '@/lib/shielded/merge-intent'
import { classifyHandlerError } from '@/lib/tx/errors'
import type { FeeSchedule } from '@/lib/relayer'

const QUERY_KEY = 'consolidation-plan'

export interface UseConsolidationPlanArgs {
  /** Price only while the merge modal is on its review step. */
  readonly enabled: boolean
  /** What to merge (and the blocked spend to check), from the merge modal's intent. */
  readonly intent: MergeIntent | null
  /** The relayer quote; its `transfer` tier is the per-proof fee. Nothing is priced without one. */
  readonly quote: FeeSchedule | null
  /** Changes whenever the wallet's balances do, so the merge is re-planned over the current notes. */
  readonly balanceKey: string
}

export interface ConsolidationPlan {
  /** The merge's fee, proofs and notes in → out (+ `blockedWillWork` for a blocked spend); null until priced. */
  readonly preview: (ConsolidationSummary & { blockedWillWork?: boolean }) | null
  /** The merged token's address, once resolved. */
  readonly tokenAddress: `0x${string}` | null
  /** Friendly reason there's no merge to confirm (nothing to merge, no USDC for the fee, …). */
  readonly error: string | null
  /** True while the merge is being priced — Confirm must wait. */
  readonly pending: boolean
  /** Re-price the merge at a freshly fetched quote (submit time). */
  priceAt(quote: FeeSchedule): Promise<ConsolidationSummary>
  /** Drop cached prices so the merge is re-planned (e.g. a submit-time re-price disagreed with review). */
  invalidate(): Promise<void>
}

function broadcasterFeeOf(quote: FeeSchedule): { amount: bigint; recipientAddress: string } {
  return { amount: BigInt(quote.fees.transfer), recipientAddress: quote.broadcasterShieldedAddress }
}

async function resolveToken(intent: MergeIntent): Promise<`0x${string}`> {
  const tokenAddress = await mergeTokenAddress(intent.token)
  if (tokenAddress === undefined) throw new Error('This token isn\'t available to merge on this network.')
  return tokenAddress
}

/**
 * Price a note merge the way the SDK will build it: which notes merge (old trees first, then the
 * smallest), one per-proof fee per proof, and — when the modal was opened from a blocked spend — whether
 * that spend plans afterwards or needs another round. Planning is local (no RPC), like the send preview.
 */
export function useConsolidationPlan(args: UseConsolidationPlanArgs): ConsolidationPlan {
  const queryClient = useQueryClient()
  const { intent, quote } = args
  const active = args.enabled && intent !== null && quote !== null
  // Query keys must be JSON-serialisable, so bigints go in as strings.
  const blockedKey = intent?.blocked
    ? [intent.blocked.kind, intent.blocked.amount.toString(), intent.blocked.recipient ?? '', intent.blocked.perProofFee.toString()]
    : []

  const query = useQuery({
    queryKey: [QUERY_KEY, intent?.token, ...blockedKey, quote?.fees.transfer, quote?.broadcasterShieldedAddress, args.balanceKey],
    queryFn: async () => {
      const tokenAddress = await resolveToken(intent!)
      const preview = await previewConsolidation({
        tokenAddress,
        broadcasterFee: broadcasterFeeOf(quote!),
        ...(intent!.blocked ? { blocked: blockedSpendRequest(intent!.blocked, tokenAddress) } : {}),
      })
      return { tokenAddress, preview }
    },
    enabled: active,
    retry: false,
    staleTime: Infinity,
  })

  const priceAt = useCallback(
    async (fresh: FeeSchedule) => {
      if (intent === null) throw new Error('No merge to price.')
      return previewConsolidation({ tokenAddress: await resolveToken(intent), broadcasterFee: broadcasterFeeOf(fresh) })
    },
    [intent],
  )

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    [queryClient],
  )

  const settled = active && !query.isFetching
  return {
    preview: settled && query.data ? query.data.preview : null,
    tokenAddress: query.data?.tokenAddress ?? null,
    error: settled && query.error ? classifyHandlerError(query.error, 'Could not work out this merge.').message : null,
    pending: active && !settled,
    priceAt,
    invalidate,
  }
}
