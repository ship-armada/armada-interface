// ABOUTME: Category-aware copy for a failed/cancelled TxError, shared by the live ErrorStep modal + the ActivityReceipt.
// ABOUTME: Keyed off TxErrorCode so the UI never says "Something went wrong" when we actually know what happened.

import { getChainById } from '@/config/network'
import { moneyMoved } from '@/lib/fees/txFigures'
import { txOutcome } from './outcome'
import type { TxError, TxErrorCode, TxKind, TxRecord } from './types'

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
    // Said when the error came while sending (or we can't tell): the relayer may have broadcast it. A record that failed
    // before sending gets RPC_ERROR_BEFORE_SENDING_BODY instead.
    body: 'We hit an error talking to the chain while sending your transaction, so it may or may not have gone through. Check your balance before trying again.',
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

/** RPC_ERROR body when the tx failed before anything was sent ({@link failedBeforeSending}). */
const RPC_ERROR_BEFORE_SENDING_BODY = 'We hit an error talking to the chain before anything was sent. Try again.'

/**
 * True when the tx failed while it was still being built (`build-proof`): every kind sends nothing until its
 * `submit-relayer` stage, which broadcasts (a wallet prompt or the relayer request).
 */
export function failedBeforeSending(record: TxRecord | null | undefined): boolean {
  if (!record) return false
  return record.stage === 'build-proof' && !record.artifacts.sourceTxHash
}

/**
 * Error codes that prove nothing went out, at any stage: the relayer or a pre-flight check refused it before
 * broadcasting, the user declined in their wallet or cancelled (only offered before broadcast), or it was mined and
 * reverted. Any other failure while sending may have broadcast — a relayer request can time out after the relayer sent it.
 */
const NOTHING_SENT_CODES: ReadonlySet<TxErrorCode> = new Set<TxErrorCode>([
  'PRE_FLIGHT_REVERT',
  'FEE_EXPIRED',
  'USER_REJECTED',
  'CANCELLED',
  'TX_REVERTED',
])

/** Where the money is, per kind, when a failed tx moved none of it. A shield's USDC never left the user's wallet. */
const FUNDS_NOTE: Record<Exclude<TxKind, 'shield' | 'shield-xchain'>, string | null> = {
  'transfer-shielded': 'Your USDC is still in your private balance.',
  'unshield-local': 'Your USDC is still in your private balance.',
  'unshield-xchain': 'Your USDC is still in your private balance.',
  'yield-deposit': 'Your USDC is still in your private balance.',
  'yield-withdraw': 'Your vault position is unchanged.',
  consolidate: 'Your private balance is unchanged.',
  // An incoming transfer is only ever recorded once it has landed.
  'transfer-shielded-received': null,
}

/**
 * A line saying where the user's USDC is after a failed or cancelled tx ("Your USDC is still in your private balance."),
 * or null when we can't be sure. Said only from evidence that nothing moved: the tx failed or was cancelled (not an
 * unknown outcome — {@link txOutcome}), a cross-chain tx hadn't burned on its source chain (`moneyMoved`), and either it
 * failed before sending ({@link failedBeforeSending}) or its error proves nothing went out (`NOTHING_SENT_CODES`). A
 * recorded hash rules it out unless the tx reverted; no recorded hash is not proof on its own.
 */
export function fundsNote(record: TxRecord | null | undefined): string | null {
  if (!record) return null
  const outcome = txOutcome(record)
  if (outcome !== 'failed' && outcome !== 'cancelled') return null
  if (moneyMoved(record)) return null
  const code = record.artifacts.error?.code
  if (record.artifacts.sourceTxHash && code !== 'TX_REVERTED') return null
  if (!failedBeforeSending(record) && !(code !== undefined && NOTHING_SENT_CODES.has(code))) return null
  if (record.kind === 'shield' || record.kind === 'shield-xchain') {
    const chainName = getChainById((record.meta as { fromChainId: number }).fromChainId)?.name
    return chainName ? `Your USDC is still in your wallet on ${chainName}.` : 'Your USDC is still in your wallet.'
  }
  return FUNDS_NOTE[record.kind]
}

/**
 * Resolve title + body for an error. Prefers the category's stock body over the raw `error.message`
 * (which is often technical), falling back to the message when a code has no stock body, then to a
 * bare fallback message (submit-time throws before a record exists). Pass `userPaidNetworkFee` (see
 * {@link userPaidNetworkFee}) so a reverted tx the user paid gas for says the fee was spent, `failedBeforeSending` (see
 * {@link failedBeforeSending}) so a network error says nothing was sent, and `fundsNote` (see {@link fundsNote}) to end
 * the body with where the user's USDC is.
 */
export function resolveTxErrorCopy(
  error?: TxError | null,
  fallbackMessage?: string,
  options?: { userPaidNetworkFee?: boolean; failedBeforeSending?: boolean; fundsNote?: string | null },
): TxErrorCopy {
  const copy = error ? TX_ERROR_COPY[error.code] : undefined
  const title = copy?.title ?? 'Something went wrong'
  const body =
    error?.code === 'TX_REVERTED' && options?.userPaidNetworkFee
      ? TX_REVERTED_USER_PAID_BODY
      : error?.code === 'RPC_ERROR' && options?.failedBeforeSending
        ? RPC_ERROR_BEFORE_SENDING_BODY
        : (copy?.body ?? error?.message ?? fallbackMessage)
  const withNote = [body, options?.fundsNote].filter(Boolean).join(' ')
  return { title, body: withNote || undefined }
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
