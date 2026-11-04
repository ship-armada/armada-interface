// ABOUTME: App-level tx-notice watcher — compares each update of the active wallet's tx list with the last one and appends
// ABOUTME: the changes worth announcing (lib/tx/notices) to txNoticeFeedAtom for the presenters. Mount once at App root.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeTxListAtom, txHistoryHydratedAtom } from '@/state/tx'
import { txInViewIdsAtom, txNoticeFeedAtom } from '@/state/txNotices'
import { activeShieldedWalletIdAtom } from '@/state/wallet'
import { detectTxNotices, snapshotTxs, type TxWatchSnapshot } from '@/lib/tx/notices'

/** Notices kept in the feed — presenters only ever show the newest few. */
const FEED_CAP = 20

/**
 * Quiet until the wallet's stored history has loaded (`txHistoryHydratedAtom`): the list at that moment is the
 * baseline, so loading history never reads as news. After that, every list or on-screen change is compared with the
 * previous one. Locking (or switching wallet) clears the feed and starts over.
 */
export function useTxNotices(): void {
  const records = useAtomValue(activeTxListAtom)
  const inView = useAtomValue(txInViewIdsAtom)
  const walletId = useAtomValue(activeShieldedWalletIdAtom)
  const hydratedFor = useAtomValue(txHistoryHydratedAtom)
  const setFeed = useSetAtom(txNoticeFeedAtom)
  const lastRef = useRef<{ walletId: string; snapshot: TxWatchSnapshot } | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    if (walletId === null || hydratedFor !== walletId) {
      if (lastRef.current !== null) setFeed([])
      lastRef.current = null
      return
    }
    const last = lastRef.current
    if (last !== null && last.walletId === walletId) {
      const events = detectTxNotices(last.snapshot, records, inView, Date.now())
      if (events.length > 0) {
        const items = events.map((event) => ({ ...event, seq: ++seqRef.current }))
        setFeed((feed) => [...feed, ...items].slice(-FEED_CAP))
      }
    }
    lastRef.current = { walletId, snapshot: snapshotTxs(records, inView) }
  }, [records, inView, walletId, hydratedFor, setFeed])
}
