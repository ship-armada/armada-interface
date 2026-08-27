// ABOUTME: Shared confirm-step layout — title, amount, summary slot, explorer + dashboard CTAs.
// ABOUTME: Ported from the armada-app design mockup; wire live tx actions via props.

import type { ReactNode } from 'react'
import { Button } from '../Button'
import { modalActionRowEnter, modalStepBodyEnter } from '../ModalShell'
import styles from './ConfirmedScreenLayout.module.css'

export interface ConfirmedScreenLayoutProps {
  title: string
  amountLabel: string
  children: ReactNode
  onViewExplorer: () => void
  onGoToDashboard: () => void
  /** When true, disables "View on explorer" (e.g. no explorer URL yet). */
  viewExplorerDisabled?: boolean
}

export function ConfirmedScreenLayout({
  title,
  amountLabel,
  children,
  onViewExplorer,
  onGoToDashboard,
  viewExplorerDisabled = false,
}: ConfirmedScreenLayoutProps) {
  return (
    <div className={styles.column}>
      <div className={`${styles.body} ${modalStepBodyEnter}`}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.amountRow}>
            <span className={styles.amountValue}>{amountLabel}</span>
          </div>
        </div>
        {children}
      </div>

      <div className={`${styles.buttonRow} ${modalActionRowEnter}`}>
        <Button
          variant="secondary"
          size="lg"
          label="View on explorer"
          showIcon={false}
          className={styles.cancelButton}
          onClick={onViewExplorer}
          disabled={viewExplorerDisabled}
        />
        <Button
          variant="primary"
          size="lg"
          label="Go to dashboard"
          showIcon={false}
          className={styles.confirmButton}
          onClick={onGoToDashboard}
        />
      </div>
    </div>
  )
}
