// ABOUTME: Counterparty address display — the fixed prefix ("0zk1" / "0x") muted, then the head and tail a user
// ABOUTME: verifies, middle elided; the full address is in the title. Split rules live in lib/address.

import { splitAddressForDisplay } from '@/lib/address'
import styles from './AddressText.module.css'

export interface AddressTextProps {
  address: string
  className?: string
}

export function AddressText({ address, className }: AddressTextProps) {
  const parts = splitAddressForDisplay(address)
  if (!parts) return <span className={className}>{address}</span>
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')} title={address}>
      <span className={styles.prefix}>{parts.prefix}</span>
      <span>{parts.head}</span>
      <span className={styles.prefix}>...</span>
      <span>{parts.tail}</span>
    </span>
  )
}
