// ABOUTME: FullAddress — the whole address as monospace groups of 4 that wrap within the card, for checking a recipient
// ABOUTME: character by character. Rendered by TransferReviewSummary under the "To" row when the user opens it.

import { groupAddress } from '@/lib/address'
import styles from './FullAddress.module.css'

export interface FullAddressProps {
  address: string
}

export function FullAddress({ address }: FullAddressProps) {
  return (
    <div className={styles.root} role="group" aria-label="Full address">
      {groupAddress(address).map((group, i) => (
        <span key={i} className={styles.group}>
          {group}
        </span>
      ))}
    </div>
  )
}
