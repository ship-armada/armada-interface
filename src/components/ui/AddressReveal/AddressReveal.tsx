// ABOUTME: AddressReveal — the recipient row's controls: the shortened address as a show/hide toggle for the full address
// ABOUTME: (the caller renders `ui/FullAddress` as its own full-width row when expanded), plus a copy button for the FULL address.

import { CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { AddressText } from '@/components/ui/AddressText'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import styles from './AddressReveal.module.css'

export interface AddressRevealProps {
  address: string
  /** Whether the caller is currently showing the full address. */
  expanded: boolean
  onToggle: () => void
}

export function AddressReveal({ address, expanded, onToggle }: AddressRevealProps) {
  const { copied, copy } = useCopyToClipboard()

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
      <button
        type="button"
        className={styles.copy}
        aria-label={copied ? 'Address copied' : 'Copy address'}
        onClick={() => void copy(address)}
      >
        {copied ? (
          <CheckIcon className={styles.copyIcon} strokeWidth={1.75} aria-hidden />
        ) : (
          <DocumentDuplicateIcon className={styles.copyIcon} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </span>
  )
}
