// ABOUTME: Atoms for tx notices outside the flow modal — which records are on screen (so they stay quiet) and the feed of
// ABOUTME: notices the watcher (hooks/useTxNotices) raised for the presenters (header pill / toasts) to show.

import { atom } from 'jotai'
import type { TxRecord } from '@/lib/tx/types'
import type { TxNoticeTone } from '@/lib/tx/notices'

/**
 * Records currently on screen — a flow modal showing its progress / outcome (registered by `useTx` with `inView`) or
 * the Activity receipt open on it. Their changes raise no notice: the screen already shows them.
 */
export const txInViewIdsAtom = atom<ReadonlySet<string>>(new Set<string>())

export interface TxNoticeItem {
  /** Monotonic per session — presenters show each item once, by seq. */
  seq: number
  tone: TxNoticeTone
  /** The record as it was when the notice was raised. */
  record: TxRecord
}

/** Most recent notices, oldest first (capped). Written only by `useTxNotices`; cleared when the wallet locks. */
export const txNoticeFeedAtom = atom<readonly TxNoticeItem[]>([])
