// ABOUTME: DeliveryTxLink — "View delivery on {chain} ↗", the explorer link to a cross-chain tx's destination (CCTP mint)
// ABOUTME: transaction, shown under the receipt / confirmation summary. Renders nothing when there's no link yet.

import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import styles from './DeliveryTxLink.module.css'

export interface DeliveryTxLinkProps {
  /** From `lib/explorer::deliveryExplorerLink`; null until the mint hash is known. */
  link: { url: string; chainName: string } | null
}

export function DeliveryTxLink({ link }: DeliveryTxLinkProps) {
  if (!link) return null
  return (
    <a className={styles.link} href={link.url} target="_blank" rel="noopener noreferrer">
      View delivery on {link.chainName}
      <ArrowTopRightOnSquareIcon className={styles.icon} strokeWidth={1.75} aria-hidden />
    </a>
  )
}
