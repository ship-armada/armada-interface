// ABOUTME: PendingTxPill — the header's pending pill beside the wallet button while txs are in flight: a spinner and the
// ABOUTME: one tx by name (else the count), or an announced tx notice. Unfolds / crossfades / folds between states.

import { useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { TxNoticeTone } from '@/lib/tx/notices'
import { TxNoticeIcon } from '@/components/tx/TxNoticeIcon'
import { noticeNeedsAttention } from '@/components/tx/TxNoticeToast'
import { useMeasuredWidth, usePillMotion } from './usePillMotion'
import styles from './PendingTxPill.module.css'

export { PILL_MOTION_MS } from './usePillMotion'

export interface PendingTxPillProps {
  /** In-flight txs for the active wallet. */
  count: number
  /** The one tx in flight, by name ("Shielding 5.00 USDC…") — shown instead of "1 Pending" when given. */
  pendingLabel?: string | null
  onOpen: () => void
  /**
   * A tx notice to announce in place of the count (the "pill" notice style) — shown even when nothing is pending,
   * e.g. "Sent 5.00 USDC" once the last tx settles. The caller decides how long it stays.
   */
  announcement?: { tone: TxNoticeTone; title: string } | null
  /** Opens the announced tx (its receipt). */
  onAnnouncementOpen?: () => void
  /** Clears an announcement that stays up until acted on (a failure or unknown outcome). */
  onAnnouncementDismiss?: () => void
}

/** What the pill shows, in priority order: an announcement, the one pending tx by name, the pending count. */
type PillContent =
  | { kind: 'announcement'; tone: TxNoticeTone; title: string }
  | { kind: 'label'; label: string }
  | { kind: 'count'; count: number }

function pillContent(
  count: number,
  pendingLabel: string | null,
  announcement: PendingTxPillProps['announcement'],
): PillContent | null {
  if (announcement) return { kind: 'announcement', tone: announcement.tone, title: announcement.title }
  if (count <= 0) return null
  if (count === 1 && pendingLabel) return { kind: 'label', label: pendingLabel }
  return { kind: 'count', count }
}

function contentKey(content: PillContent): string {
  switch (content.kind) {
    case 'announcement':
      return `announcement:${content.tone}:${content.title}`
    case 'label':
      return `label:${content.label}`
    case 'count':
      return `count:${content.count}`
  }
}

export function PendingTxPill({
  count,
  pendingLabel = null,
  onOpen,
  announcement = null,
  onAnnouncementOpen,
  onAnnouncementDismiss,
}: PendingTxPillProps) {
  const content = pillContent(count, pendingLabel, announcement)
  const key = content ? contentKey(content) : null
  const { shown, leaving, phase } = usePillMotion(content, key)
  const contentRef = useRef<HTMLSpanElement>(null)
  const contentWidth = useMeasuredWidth(contentRef, key)
  // Live content whenever there is some; the last-shown snapshot only while the pill folds away.
  const display = content ?? shown
  if (!display) return null
  const exiting = phase === 'closing' || phase === 'vanishing'

  function body(item: PillContent) {
    switch (item.kind) {
      case 'announcement': {
        const attention = noticeNeedsAttention(item.tone)
        return (
          <>
            <button
              type="button"
              className={`${styles.button} ${attention ? styles.buttonBeforeDismiss : ''}`}
              onClick={onAnnouncementOpen}
              aria-label={`${item.title} — ${attention ? 'view details' : 'view'}`}
            >
              <TxNoticeIcon tone={item.tone} />
              <span className={styles.text}>
                <span className={styles.announcementTitle}>{item.title}</span>
                {attention ? <span className={styles.announcementAction}>View details</span> : null}
              </span>
            </button>
            {attention ? (
              <button type="button" className={styles.dismissButton} onClick={onAnnouncementDismiss} aria-label="Dismiss">
                <XMarkIcon className={styles.dismissIcon} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
          </>
        )
      }
      case 'label':
        return (
          <button type="button" className={styles.button} onClick={onOpen} aria-label={`${item.label} — view progress`}>
            <TxNoticeIcon tone="pending" />
            <span className={`${styles.text} ${styles.pendingLabel}`}>{item.label}</span>
          </button>
        )
      case 'count': {
        const noun = item.count === 1 ? 'transaction' : 'transactions'
        return (
          <button
            type="button"
            className={styles.button}
            onClick={onOpen}
            aria-label={`${item.count} ${noun} pending — view activity`}
          >
            <TxNoticeIcon tone="pending" />
            <span className={styles.text}>{item.count} Pending</span>
          </button>
        )
      }
    }
  }

  return (
    <span
      className={styles.pill}
      data-phase={phase}
      // Open: exactly the content's width, so a change of content eases the width across (CSS transition).
      style={phase === 'open' && contentWidth > 0 ? { width: contentWidth } : undefined}
    >
      {leaving ? (
        <span className={`${styles.content} ${styles.leaving}`} data-leaving aria-hidden inert>
          {body(leaving)}
        </span>
      ) : null}
      <span ref={contentRef} key={key ?? 'exiting'} className={styles.content} inert={exiting}>
        {body(display)}
      </span>
    </span>
  )
}
