// ABOUTME: ReceivedSummary — a received payment's summary table (date / sender when disclosed / memo). No Fees or Total:
// ABOUTME: the recipient pays nothing, and the amount is the headline. Shares the deposit/transfer summary styling.

import { ArmadaLogo } from '@/design'
import { formatTransactionDateTime, truncateAddress } from '@/lib/format'
// The deposit summary's styles, so the received table stays in visual sync with the other flows' summaries.
import styles from '../../deposit/DepositReviewSummary/DepositReviewSummary.module.css'

export interface ReceivedSummaryProps {
  /** The sender's 0zk address — only when they chose to disclose it; the row hides otherwise. */
  senderShieldedAddress?: string
  /** The memo the sender attached; the row hides when there's none. */
  memoText?: string
  /** Completion timestamp (ms) — adds a leading "Date and time" row. */
  confirmedAt?: number
}

export function ReceivedSummary({ senderShieldedAddress, memoText, confirmedAt }: ReceivedSummaryProps) {
  return (
    <div className={styles.summary}>
      <div className={styles.summaryBody}>
        {confirmedAt !== undefined ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Date and time</span>
            <span className={styles.summaryValue}>{formatTransactionDateTime(confirmedAt)}</span>
          </div>
        ) : null}
        {senderShieldedAddress ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>From</span>
            <span className={styles.summaryValue}>
              <span className={styles.valueWithIcon}>
                <ArmadaLogo variant="mark" markTone="deep" className={styles.armadaIcon} />
                <span>{truncateAddress(senderShieldedAddress)}</span>
              </span>
            </span>
          </div>
        ) : null}
        {memoText ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Memo</span>
            <span className={styles.summaryValue}>{memoText}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
