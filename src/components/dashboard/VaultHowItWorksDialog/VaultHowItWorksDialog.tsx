// ABOUTME: Dialog for "How the shielded vault works" — opened from the How it works link on the earn card.
// ABOUTME: Names where the yield comes from, the vault fee, withdrawing, privacy, and the risks.

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { formatFeePercent } from '@/lib/yield'
import styles from './VaultHowItWorksDialog.module.css'

const TITLE = 'How the shielded vault works'

export interface VaultHowItWorksDialogProps {
  onClose: () => void
  /** The vault's fee on earnings (basis points), when known — named in the fee line. */
  yieldFeeBps?: bigint
}

export function VaultHowItWorksDialog({ onClose, yieldFeeBps }: VaultHowItWorksDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const fee = yieldFeeBps !== undefined ? `keeps ${formatFeePercent(yieldFeeBps)} of what you earn` : 'keeps a share of what you earn'

  useBodyScrollLock(true)
  useRestoreFocus(true)
  useEscapeKey(onClose)
  useFocusTrap(dialogRef)

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  return createPortal(
    <div className={styles.scrim} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.dialog}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.handleRow} aria-hidden>
          <span className={styles.handle} />
        </div>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {TITLE}
          </h2>
          <button ref={closeRef} type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}>
            <XMarkIcon className={styles.closeIcon} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className={styles.topics}>
          {(
            [
              {
                title: 'Where the yield comes from',
                body: 'The vault lends your USDC on Aave and earns its interest. The rate changes with demand for borrowing.',
              },
              {
                title: 'Fee',
                body: `The vault ${fee}; the rate shown is already after it.`,
              },
              {
                title: 'Withdraw any time',
                body: 'Move USDC back to your private balance whenever you like, for the usual relayer fee.',
              },
              {
                title: 'Private',
                body: 'Your vault position is held in your shielded balance, not linked to your public address.',
              },
              {
                title: 'Risks',
                body: "Like any DeFi deposit, funds depend on smart contracts (Armada's and Aave's) working as intended. If Aave's USDC is fully borrowed, a withdrawal can be delayed until there's liquidity. The rate isn't guaranteed, and deposits aren't insured.",
              },
            ] as const
          ).map((topic) => (
            <section key={topic.title} className={styles.topic}>
              <h3 className={styles.topicTitle}>{topic.title}</h3>
              <p className={styles.topicBody}>{topic.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
