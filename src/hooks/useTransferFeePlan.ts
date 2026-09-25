// ABOUTME: useTransferFeePlan — prices a private (0zk) send at review time by planning it without proving, so a
// ABOUTME: fragmented wallet's split fee (one per-proof fee per proof) is shown, capped into Max, and approved.

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { maxTransferAmount, planTransferFee } from '@/lib/shielded/transfer-sdk'
import { classifyHandlerError } from '@/lib/tx/errors'
import type { FeeSchedule } from '@/lib/relayer'
import { useDebouncedValue } from './useDebouncedValue'

/** Planning reads only local scan state, but merkle-proof assembly still costs CPU — skip keystrokes. */
const AMOUNT_DEBOUNCE_MS = 250

const QUERY_KEY = 'transfer-fee-plan'

export interface UseTransferFeePlanArgs {
  /** Price only while a private send is on its amount/review steps. */
  readonly enabled: boolean
  readonly recipient: string
  readonly amount: bigint
  /** The relayer quote; its `transfer` tier is the per-proof fee. Nothing is priced without one. */
  readonly quote: FeeSchedule | null
  /** Spendable shielded balance — re-prices the send and Max when the wallet's notes change. */
  readonly balance: bigint
}

export interface TransferFeePlan {
  /** Total fee for the current amount across every proof; null until priced (or when pricing failed). */
  readonly fee: bigint | null
  /** How many proofs the send splits into; null until priced. */
  readonly proofs: number | null
  /** Largest amount the SDK can plan a send of, fee included (the Max); null until computed or on a read error. */
  readonly maxInput: bigint | null
  /** Friendly reason the current amount can't be sent (too fragmented, insufficient, …); null when fine. */
  readonly error: string | null
  /** The in-app fix for `error`, when there is one (`merge-notes`: the wallet's notes are too fragmented). */
  readonly remedy: 'merge-notes' | null
  /** True while the current amount is being priced — Confirm must wait for the real fee. */
  readonly pending: boolean
  /** Re-price the current amount at a freshly fetched quote (submit time); resolves the total fee. */
  priceAt(quote: FeeSchedule): Promise<bigint>
  /** Drop cached prices so the amount is re-priced (e.g. a submit-time re-price disagreed with review). */
  invalidate(): Promise<void>
}

function broadcasterFeeOf(quote: FeeSchedule): { amount: bigint; recipientAddress: string } {
  return { amount: BigInt(quote.fees.transfer), recipientAddress: quote.broadcasterShieldedAddress }
}

/**
 * Price a private send the way the SDK will charge it. A wallet holding many small notes can need a
 * circuit shape the deployment doesn't have; the SDK then splits the send into several proofs, each
 * paying the relayer's per-proof fee. Planning (no proving) reveals the real total up front, so review
 * shows — and the user approves — what will actually be charged, and Max leaves room for it.
 */
export function useTransferFeePlan(args: UseTransferFeePlanArgs): TransferFeePlan {
  const queryClient = useQueryClient()
  const debouncedAmount = useDebouncedValue(args.amount, AMOUNT_DEBOUNCE_MS)
  const quote = args.quote
  const active = args.enabled && quote !== null
  // Query keys must be JSON-serialisable, so bigints go in as strings.
  const quoteKey = quote ? [quote.fees.transfer, quote.broadcasterShieldedAddress] : []

  const feeQuery = useQuery({
    queryKey: [QUERY_KEY, 'fee', args.recipient, debouncedAmount.toString(), args.balance.toString(), ...quoteKey],
    queryFn: () =>
      planTransferFee({ recipient: args.recipient, amount: debouncedAmount, broadcasterFee: broadcasterFeeOf(quote!) }),
    enabled: active && debouncedAmount > 0n,
    retry: false,
    staleTime: Infinity,
  })

  // Max doesn't depend on the recipient; the balance keys it to the wallet's current notes.
  const maxQuery = useQuery({
    queryKey: [QUERY_KEY, 'max', args.balance.toString(), ...quoteKey],
    queryFn: () => maxTransferAmount({ broadcasterFee: broadcasterFeeOf(quote!) }),
    enabled: active && args.balance > 0n,
    retry: false,
    staleTime: Infinity,
  })

  const priceAt = useCallback(
    async (fresh: FeeSchedule) => {
      const { totalFee } = await planTransferFee({
        recipient: args.recipient,
        amount: args.amount,
        broadcasterFee: broadcasterFeeOf(fresh),
      })
      return totalFee
    },
    [args.recipient, args.amount],
  )

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    [queryClient],
  )

  const priceable = active && args.amount > 0n
  const settled = priceable && debouncedAmount === args.amount && !feeQuery.isFetching
  const failure =
    settled && feeQuery.error ? classifyHandlerError(feeQuery.error, 'Could not work out the fee for this send.') : null
  return {
    fee: settled && feeQuery.data ? feeQuery.data.totalFee : null,
    proofs: settled && feeQuery.data ? feeQuery.data.proofs : null,
    maxInput: maxQuery.data ?? null,
    error: failure?.message ?? null,
    remedy: failure?.remedy ?? null,
    pending: priceable && !settled,
    priceAt,
    invalidate,
  }
}
