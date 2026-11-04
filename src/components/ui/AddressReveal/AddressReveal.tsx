// ABOUTME: AddressReveal — the recipient row's controls: the shortened address as a show/hide toggle for the full address
// ABOUTME: (the caller renders `ui/FullAddress` as its own full-width row when expanded), plus a copy button for the FULL address.

import { AddressText } from '@/components/ui/AddressText'
import { CopyAddressButton } from '@/components/ui/CopyAddressButton'
import styles from './AddressReveal.module.css'

export interface AddressRevealProps {
  address: string
  /** Whether the caller is currently showing the full address. */
  expanded: boolean
  onToggle: () => void
}

export function AddressReveal({ address, expanded, onToggle }: AddressRevealProps) {
  return (
    <span className={styles.line}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide full address' : 'Show full address'}
        onClick={onToggle}
      >
        <AddressText address={address} />
      </button>
      <CopyAddressButton address={address} />
    </span>
  )
}
