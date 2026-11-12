// ABOUTME: TransactionHashRow — a receipt's transaction hash, in the same summary row as the other details.
// ABOUTME: The shortened hash is underlined and copies the full hash. It sits above the fee.

import { CopyableAddress } from '@/components/ui/CopyableAddress'
import { truncateAddressEnds } from '@/lib/format'
import styles from '@/components/deposit/DepositReviewSummary/DepositReviewSummary.module.css'

export function TransactionHashRow({ txHash }: { txHash: string }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>Transaction</span>
      <span className={styles.summaryValue}>
        <span className={styles.valueWithIcon}>
          <CopyableAddress
            address={txHash}
            display={truncateAddressEnds(txHash)}
            label="Copy transaction hash"
            copiedLabel="Transaction hash copied"
            presentation="link"
          />
        </span>
      </span>
    </div>
  )
}
