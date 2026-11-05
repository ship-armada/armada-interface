// ABOUTME: Which tx record changes are worth telling the user about outside the flow modal — settled / failed / uncertain
// ABOUTME: outcomes and freshly received payments (a tx in flight is the header pill's). Pure: compares two list snapshots.

import type { TxExecutionState, TxRecord } from './types'
import { isTerminalState } from './types'
import { txOutcome } from './outcome'

/**
 * The tone of a tx's notice copy and icon:
 *   pending   — still in flight (the header pill's label; never raised as a notice).
 *   success   — it settled.
 *   failure   — it definitively failed.
 *   uncertain — we stopped watching without knowing (timeout / expiry); it may still have landed.
 *   received  — someone paid us.
 */
export type TxNoticeTone = 'pending' | 'success' | 'failure' | 'uncertain' | 'received'

/** The tones raised as notices — outcomes. A tx in flight is shown by the header pill instead. */
export type TxNoticeOutcome = Exclude<TxNoticeTone, 'pending'>

export interface TxNoticeEvent {
  record: TxRecord
  tone: TxNoticeOutcome
}

/** The part of the tx list the detector compares between updates. */
export interface TxWatchSnapshot {
  states: ReadonlyMap<string, TxExecutionState>
}

/**
 * A received payment is announced only when it's this recent. Rebuilding history from chain (on unlock, or after
 * "Clear local history") inserts old received records as if new; they're history, not news.
 */
export const RECEIVED_NOTICE_MAX_AGE_MS = 10 * 60_000

export function snapshotTxs(records: readonly TxRecord[]): TxWatchSnapshot {
  return { states: new Map(records.map((record) => [record.id, record.executionState])) }
}

/**
 * The notices one update of the tx list calls for. A tx on screen says nothing — its modal or receipt already shows
 * what's happening. A record first seen already settled is never announced (it's history being loaded), except a
 * recent received payment. A user cancel is silent: they did it themselves.
 */
export function detectTxNotices(
  prev: TxWatchSnapshot,
  records: readonly TxRecord[],
  inView: ReadonlySet<string>,
  now: number,
): TxNoticeEvent[] {
  const events: TxNoticeEvent[] = []
  for (const record of records) {
    if (inView.has(record.id)) continue
    const before = prev.states.get(record.id)
    if (before === undefined) {
      if (
        record.kind === 'transfer-shielded-received'
        && record.executionState === 'completed'
        && now - record.createdAt <= RECEIVED_NOTICE_MAX_AGE_MS
      ) {
        events.push({ record, tone: 'received' })
      }
      continue
    }
    if (!isTerminalState(before) && isTerminalState(record.executionState)) {
      const tone = outcomeTone(record)
      if (tone) events.push({ record, tone })
    }
  }
  return events
}

function outcomeTone(record: TxRecord): TxNoticeOutcome | null {
  switch (txOutcome(record)) {
    case 'settled':
      return 'success'
    case 'failed':
      return 'failure'
    case 'unknown':
      return 'uncertain'
    case 'cancelled':
    case 'pending':
      return null
  }
}
