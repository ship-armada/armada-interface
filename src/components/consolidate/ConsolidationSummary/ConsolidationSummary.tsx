// ABOUTME: ConsolidationSummary — the note-merge summary table (date / token / notes N → M / fee) with a Total that
// ABOUTME: is just the fee, since a merge moves no value out of the wallet. Shares the deposit/transfer summary styling.

import { formatTransactionDateTime, formatUsdcAmount } from '@/lib/format'
import usdcAmount from '@/design/styles/usdcAmount.module.css'
// The deposit summary's styles, so the merge table stays in visual sync with the other flows' summaries.
import styles from '../../deposit/DepositReviewSummary/DepositReviewSummary.module.css'

export interface ConsolidationSummaryProps {
  /** The merged token's display name ("USDC", "Vault shares"); the row hides when unknown. */
  tokenLabel?: string
  /** How many notes the merge spends, and how many it leaves; the row hides when unknown. */
  notesMerged?: number
  notesCreated?: number
  /** Total relayer fee across every proof (USDC). "—" while it's still being worked out. */
  fee: bigint | null
  /** Completion timestamp (ms) — adds a leading "Date and time" row. */
  confirmedAt?: number
}

export function ConsolidationSummary({ tokenLabel, notesMerged, notesCreated, fee, confirmedAt }: ConsolidationSummaryProps) {
  const feeText = fee === null ? '—' : `${formatUsdcAmount(fee)} USDC`
  return (
    <div className={styles.summary}>
      <div className={styles.summaryBody}>
        {confirmedAt !== undefined ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Date and time</span>
            <span className={styles.summaryValue}>{formatTransactionDateTime(confirmedAt)}</span>
          </div>
        ) : null}
        {tokenLabel ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Token</span>
            <span className={styles.summaryValue}>{tokenLabel}</span>
          </div>
        ) : null}
        {notesMerged !== undefined && notesCreated !== undefined ? (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Notes</span>
            <span className={styles.summaryValue}>{`${notesMerged} → ${notesCreated}`}</span>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Fees</span>
          <span className={[styles.summaryValue, usdcAmount.font].join(' ')}>{feeText}</span>
        </div>
      </div>
      {/* Nothing but the fee leaves the wallet: the merged notes come straight back to it. */}
      <div className={styles.summaryTotalRow}>
        <span className={styles.summaryTotalLabel}>Total</span>
        <span className={[styles.summaryTotalValue, usdcAmount.font].join(' ')}>{feeText}</span>
      </div>
    </div>
  )
}
