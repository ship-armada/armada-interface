// ABOUTME: Which tx record changes are worth telling the user about outside the flow modal — settled / failed / uncertain
// ABOUTME: outcomes, leaving a modal mid-flight, and freshly received payments. Pure: compares two snapshots of the list.

import type { TxExecutionState, TxRecord } from './types'
import { isTerminalState } from './types'
import { txOutcome } from './outcome'

/**
 * What a notice says about its tx:
 *   pending   — the user left the flow while it's still in flight (it carries on in the background).
 *   success   — it settled.
 *   failure   — it definitively failed.
 *   uncertain — we stopped watching without knowing (timeout / expiry); it may still have landed.
 *   received  — someone paid us.
 */
export type TxNoticeTone = 'pending' | 'success' | 'failure' | 'uncertain' | 'received'

export interface TxNoticeEvent {
  record: TxRecord
  tone: TxNoticeTone
}

/** The part of the tx list the detector compares between updates. */
export interface TxWatchSnapshot {
  states: ReadonlyMap<string, TxExecutionState>
  /** Records currently on screen — in their flow modal or the Activity receipt. */
  inView: ReadonlySet<string>
}

/**
 * A received payment is announced only when it's this recent. Rebuilding history from chain (on unlock, or after
 * "Clear local history") inserts old received records as if new; they're history, not news.
 */
export const RECEIVED_NOTICE_MAX_AGE_MS = 10 * 60_000

export function snapshotTxs(records: readonly TxRecord[], inView: ReadonlySet<string>): TxWatchSnapshot {
  return { states: new Map(records.map((record) => [record.id, record.executionState])), inView }
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
      continue
    }
    if (!isTerminalState(record.executionState) && prev.inView.has(record.id)) {
      events.push({ record, tone: 'pending' })
    }
  }
  return events
}

function outcomeTone(record: TxRecord): TxNoticeTone | null {
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
