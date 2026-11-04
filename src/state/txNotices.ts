// ABOUTME: Atoms for tx notices outside the flow modal — which records are on screen (so they stay quiet) and the feed of
// ABOUTME: notices the watcher (hooks/useTxNotices) raised, how they're presented (toast / header pill), and the pill's announcement.

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
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

/**
 * How tx notices are presented — `toast` (a floating toast per tx, bottom-right) or `pill` (the header's pending pill
 * widens to announce it). A trial setting, picked on the Debug page and persisted.
 */
export type TxNoticeStyle = 'toast' | 'pill'

export const txNoticeStyleAtom = atomWithStorage<TxNoticeStyle>('armada-interface.txNoticeStyle', 'toast')

/** What the header pill is announcing right now (pill style only); null = it shows the pending count. */
export interface TxNoticeAnnouncement {
  seq: number
  tone: TxNoticeTone
  title: string
  recordId: string
}

export const txNoticeAnnouncementAtom = atom<TxNoticeAnnouncement | null>(null)
