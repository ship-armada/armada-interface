// ABOUTME: txOutcome — a tx record's outcome bucket (settled / pending / failed / cancelled / unknown), keyed off its
// ABOUTME: execution state + error code (+ stage, for a network error). Shared by the activity list, the receipt and txFigures' moneyMoved.

import type { TxErrorCode, TxRecord } from './types'
import { isTerminalState } from './types'

/**
 * Outcome bucket for a tx record (an activity row's status).
 *   settled   — completed on chain.
 *   pending   — still in flight.
 *   failed    — definitively failed (revert / relayer rejection / pre-flight / interrupted / fee-expired, or a network
 *               error before sending). Nothing settled — except a cross-chain tx whose source burn confirmed before
 *               its delivery failed (see `moneyMoved`).
 *   cancelled — nothing was sent: the user cancelled, or declined the wallet prompt (USER_REJECTED).
 *   unknown   — we stopped watching (timeout / dismissed / duplicate / expired), or a network error hit while the tx
 *               was being sent; it MAY still have settled on chain, so we never present these as "failed".
 */
export type TxOutcome = 'settled' | 'pending' | 'failed' | 'cancelled' | 'unknown'

/** Error codes whose outcome is indeterminate — the tx may still have landed. */
const INDETERMINATE_CODES: ReadonlySet<TxErrorCode> = new Set([
  'POLL_TIMEOUT',
  'DISMISSED',
  'DUPLICATE_TX',
  'STUCK',
])

/**
 * True when the tx failed while it was still being built (`build-proof`): every kind sends nothing until its
 * `submit-relayer` stage, which broadcasts (a wallet prompt or the relayer request). False when the stage is unknown.
 */
export function failedBeforeSending(record: Partial<Pick<TxRecord, 'stage' | 'artifacts'>> | null | undefined): boolean {
  if (!record) return false
  return record.stage === 'build-proof' && !record.artifacts?.sourceTxHash
}

/**
 * Reduce a record's executionState + error code to an outcome bucket. Keyed off `error.code` for
 * the terminal cases so a DISMISSED (had broadcast → may complete) isn't confused with a CANCELLED
 * (nothing sent), and so timeouts/expiry never read as a hard failure.
 */
export function txOutcome(record: Pick<TxRecord, 'executionState' | 'artifacts'> & Partial<Pick<TxRecord, 'stage'>>): TxOutcome {
  const state = record.executionState
  if (state === 'completed') return 'settled'
  if (!isTerminalState(state)) return 'pending'
  const code = record.artifacts.error?.code
  // The error CODE is authoritative for the outcome bucket — the executionState machinery can land
  // the same code on either `cancelled` or `failed` (e.g. a thrown CANCELLED routes through
  // markFailed), so we key off the code first and fall back to the state.
  // Indeterminate — we stopped watching; the tx may still have settled on chain. Never "failed".
  if (state === 'expired' || (code !== undefined && INDETERMINATE_CODES.has(code))) return 'unknown'
  // A network error while sending: the relayer (or wallet) may have broadcast before the error reached us.
  if (code === 'RPC_ERROR' && !failedBeforeSending(record)) return 'unknown'
  // User-initiated aborts, nothing sent: the app Cancel button (CANCELLED / `cancelled` state) AND a
  // declined wallet prompt (USER_REJECTED). Group as "Cancelled" — matches the modal's "Action
  // declined — nothing submitted" framing.
  if (state === 'cancelled' || code === 'CANCELLED' || code === 'USER_REJECTED') return 'cancelled'
  return 'failed'
}
