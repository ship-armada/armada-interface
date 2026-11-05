// ABOUTME: Atoms for tx notices outside the flow modal — which records are on screen (so they stay quiet) and the feed of
// ABOUTME: notices the watcher (hooks/useTxNotices) raised, how they're presented (the Settings preference), and the pill's announcement.

import { atom } from 'jotai'
import { preferencesAtom, type TxNoticeStyle } from './preferences'
import type { TxRecord } from '@/lib/tx/types'
import type { TxNoticeOutcome } from '@/lib/tx/notices'

/**
 * Records currently on screen — a flow modal showing its progress / outcome (registered by `useTx` with `inView`) or
 * the Activity receipt open on it. Their changes raise no notice: the screen already shows them.
 */
export const txInViewIdsAtom = atom<ReadonlySet<string>>(new Set<string>())

export interface TxNoticeItem {
  /** Monotonic per session — presenters show each item once, by seq. */
  seq: number
  tone: TxNoticeOutcome
  /** The record as it was when the notice was raised. */
  record: TxRecord
}

/** Most recent notices, oldest first (capped). Written only by `useTxNotices`; cleared when the wallet locks. */
export const txNoticeFeedAtom = atom<readonly TxNoticeItem[]>([])

export type { TxNoticeStyle } from './preferences'

/**
 * How tx outcome notices are presented — the user's Settings preference (`preferencesAtom.txNoticeStyle`), toasts by
 * default (also for preferences saved before the setting existed). Writing it updates the saved preferences.
 */
export const txNoticeStyleAtom = atom(
  (get): TxNoticeStyle => get(preferencesAtom).txNoticeStyle ?? 'toast',
  (get, set, style: TxNoticeStyle) => set(preferencesAtom, { ...get(preferencesAtom), txNoticeStyle: style }),
)

/** What the header pill is announcing right now (pill style only); null = it shows the pending count. */
export interface TxNoticeAnnouncement {
  seq: number
  tone: TxNoticeOutcome
  title: string
  recordId: string
}

export const txNoticeAnnouncementAtom = atom<TxNoticeAnnouncement | null>(null)
