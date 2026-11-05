// ABOUTME: useTxNoticePresenter — shows each new notice from txNoticeFeedAtom once, in the user's chosen style (Settings):
// ABOUTME: a floating toast per tx (keyed by record id, so it updates in place) or the header pill announcing it.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { TxNoticeOutcome } from '@/lib/tx/notices'
import { selfSendAsMerge } from '@/lib/tx/selfSend'
import { txNoticeTitle } from '@/components/tx/noticeCopy'
import { TxNoticeToast, noticeNeedsAttention } from '@/components/tx/TxNoticeToast'
import { txNoticeAnnouncementAtom, txNoticeFeedAtom, txNoticeStyleAtom } from '@/state/txNotices'
import { balanceHiddenAtom } from '@/state/ui'
import { evmAddressAtom, shieldedWalletAtom } from '@/state/wallet'
import { useOpenTxActivity } from './useOpenTxActivity'

/** How long the header pill announces a notice before folding back to the count (not failures — those wait). */
export const PILL_ANNOUNCE_MS = 5_000

/** How long each toast stays; a problem stays longer so it isn't missed. */
const TOAST_MS: Record<TxNoticeOutcome, number> = {
  success: 6_000,
  received: 6_000,
  failure: 10_000,
  uncertain: 10_000,
}

/** Mount once at App root (inside the Router — the notices open receipts on the Dashboard). */
export function useTxNoticePresenter(): void {
  const feed = useAtomValue(txNoticeFeedAtom)
  const style = useAtomValue(txNoticeStyleAtom)
  const hideAmounts = useAtomValue(balanceHiddenAtom)
  const ownEvmAddress = useAtomValue(evmAddressAtom)
  const ownShieldedAddress = useAtomValue(shieldedWalletAtom).shieldedAddress
  const setAnnouncement = useSetAtom(txNoticeAnnouncementAtom)
  const { openReceipt } = useOpenTxActivity()
  // Highest feed seq already shown — each notice is presented once.
  const shownSeqRef = useRef(0)
  const foldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // An emptied feed (the wallet locked) starts its numbering over.
    if (feed.length === 0) {
      shownSeqRef.current = 0
      return
    }
    const fresh = feed.filter((item) => item.seq > shownSeqRef.current)
    const last = fresh[fresh.length - 1]
    if (!last) return
    shownSeqRef.current = last.seq

    for (const item of fresh) {
      // Read like the Activity row: a private send to the wallet's own 0zk is a merge.
      const record = selfSendAsMerge(item.record, ownShieldedAddress)
      const title = txNoticeTitle(record, item.tone, { hideAmounts, ownEvmAddress })
      if (style === 'toast') {
        toast.custom(
          (toastId) => (
            <TxNoticeToast
              tone={item.tone}
              title={title}
              onView={() => {
                toast.dismiss(toastId)
                openReceipt(record.id)
              }}
            />
          ),
          { id: record.id, duration: TOAST_MS[item.tone] },
        )
        continue
      }
      setAnnouncement({ seq: item.seq, tone: item.tone, title, recordId: record.id })
      if (foldTimerRef.current) clearTimeout(foldTimerRef.current)
      foldTimerRef.current = null
      if (!noticeNeedsAttention(item.tone)) {
        foldTimerRef.current = setTimeout(() => {
          foldTimerRef.current = null
          setAnnouncement((current) => (current?.seq === item.seq ? null : current))
        }, PILL_ANNOUNCE_MS)
      }
    }
  }, [feed, style, hideAmounts, ownEvmAddress, ownShieldedAddress, setAnnouncement, openReceipt])

  // Switching to toasts (or locking) leaves no stale pill announcement behind.
  useEffect(() => {
    if (style === 'toast' || feed.length === 0) setAnnouncement(null)
  }, [style, feed.length, setAnnouncement])

  useEffect(
    () => () => {
      if (foldTimerRef.current) clearTimeout(foldTimerRef.current)
    },
    [],
  )
}
