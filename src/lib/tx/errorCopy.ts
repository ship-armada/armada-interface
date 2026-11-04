// ABOUTME: Category-aware copy for a failed/cancelled TxError, shared by the live ErrorStep modal + the ActivityReceipt.
// ABOUTME: Keyed off TxErrorCode so the UI never says "Something went wrong" when we actually know what happened.

import type { TxError, TxErrorCode, TxRecord } from './types'

export interface TxErrorCopy {
  title: string
  body?: string
}

/**
 * Per-code copy. POLL_TIMEOUT / STUCK / DISMISSED / DUPLICATE_TX phrase "may still complete" (we stopped
 * watching, but the tx could have landed) and ask the user to check their balance before starting a new
 * transaction, so they don't pay twice; the definitive failures are unambiguous; USER_REJECTED /
 * CANCELLED make clear nothing was sent.
 */
export const TX_ERROR_COPY: Record<TxErrorCode, TxErrorCopy> = {
  TX_REVERTED: {
    title: 'Transaction failed on chain',
    body: 'The network mined your transaction but the contract reverted. No funds were moved.',
  },
  PRE_FLIGHT_REVERT: {
    // No stock body — falls through to error.message, which carries the actual contract
    // revert reason from the pre-flight simulate.
    title: 'Pre-flight check failed — nothing was sent',
  },
  POLL_TIMEOUT: {
    title: 'Lost track of your transaction',
    body: 'We stopped watching after the time budget elapsed. The transaction may still complete — check the explorer to confirm. Check your balance before starting a new transaction.',
  },
  RPC_ERROR: {
    title: 'Network error',
    body: 'We hit an error talking to the chain. Try again — your transaction may not have been submitted yet.',
  },
  USER_REJECTED: {
    title: 'Action declined',
    body: 'You declined the prompt in your wallet. Nothing was submitted.',
  },
  INTERRUPTED: {
    title: 'Transaction interrupted',
    body: 'This transaction was interrupted before it was sent — nothing left your wallet. Start a new transaction.',
  },
  FEE_EXPIRED: {
    title: 'Fee quote expired',
    body: 'The quoted fee was no longer valid when the relayer received your transaction. Nothing was sent — start a new transaction to get a fresh quote.',
  },
  DUPLICATE_TX: {
    title: 'Already submitted',
    body: 'The relayer already has this transaction — it may still complete. Check the explorer to confirm. Check your balance before starting a new transaction.',
  },
  CANCELLED: {
    title: 'Cancelled',
    body: 'No transaction was sent.',
  },
  DISMISSED: {
    title: 'Stopped tracking',
    body: 'You asked us to stop watching this transaction. It may still complete on chain — check the explorer. Check your balance before starting a new transaction.',
  },
  STUCK: {
    title: 'Lost track of your transaction',
    body: 'This transaction stalled unexpectedly. It may still complete on chain — check the explorer to confirm. Check your balance before starting a new transaction.',
  },
  OTHER: {
    title: 'Something went wrong',
  },
}

/**
 * TX_REVERTED body when the user's own wallet sent the reverted tx: the USDC didn't move, but unlike a
 * relayer-submitted tx (the relayer pays gas) the user's network fee WAS spent — "No funds were moved" would be wrong.
 */
const TX_REVERTED_USER_PAID_BODY =
  "The network mined your transaction but the contract reverted. Your USDC didn't move, but the network fee was spent."

/**
 * True when the user's own wallet sent (and paid gas for) the record's on-chain tx: a shield or cross-chain shield on
 * the direct path (`useGasless` not set). Every spend, and the gasless shield, is relayer-submitted — the relayer pays.
 */
export function userPaidNetworkFee(record: TxRecord | null | undefined): boolean {
  if (!record) return false
  if (record.kind !== 'shield' && record.kind !== 'shield-xchain') return false
  return (record.meta as { useGasless?: boolean }).useGasless !== true
}

/**
 * Resolve title + body for an error. Prefers the category's stock body over the raw `error.message`
 * (which is often technical), falling back to the message when a code has no stock body, then to a
 * bare fallback message (submit-time throws before a record exists). Pass `userPaidNetworkFee` (see
 * {@link userPaidNetworkFee}) so a reverted tx the user paid gas for says the fee was spent.
 */
export function resolveTxErrorCopy(
  error?: TxError | null,
  fallbackMessage?: string,
  options?: { userPaidNetworkFee?: boolean },
): TxErrorCopy {
  if (error?.code === 'TX_REVERTED' && options?.userPaidNetworkFee) {
    return { title: TX_ERROR_COPY.TX_REVERTED.title, body: TX_REVERTED_USER_PAID_BODY }
  }
  const copy = error ? TX_ERROR_COPY[error.code] : undefined
  return {
    title: copy?.title ?? 'Something went wrong',
    body: copy?.body ?? error?.message ?? fallbackMessage,
  }
}

/** Codes whose retry only RE-CHECKS an already-broadcast tx (re-enters the confirmation wait with the known hash). */
const RECHECK_CODES: ReadonlySet<TxErrorCode> = new Set<TxErrorCode>(['POLL_TIMEOUT', 'STUCK', 'DISMISSED'])

/**
 * The error step's in-place retry label. For an outcome we lost track of, retrying never resends — it re-watches the
 * tx by its hash — so "Try again" (which reads as "send it again") would make the user fear paying twice: say
 * "Check again". Callers still use "Start over" when the record isn't retryable in place (`canRetryTx`).
 */
export function retryActionLabel(error?: TxError | null): 'Check again' | 'Try again' {
  return error && RECHECK_CODES.has(error.code) ? 'Check again' : 'Try again'
}
