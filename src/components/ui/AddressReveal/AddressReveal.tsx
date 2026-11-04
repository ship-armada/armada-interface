// ABOUTME: AddressReveal — a counterparty address shown shortened (AddressText) that expands to the full address on tap,
// ABOUTME: plus a copy button that copies the FULL address. Used on the send review / receipt "To" row.

import { useState } from 'react'
import { CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { AddressText } from '@/components/ui/AddressText'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import styles from './AddressReveal.module.css'

export interface AddressRevealProps {
  address: string
}

export function AddressReveal({ address }: AddressRevealProps) {
  const [expanded, setExpanded] = useState(false)
  const { copied, copy } = useCopyToClipboard()

  return (
    <span className={styles.root}>
      <span className={styles.line}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide full address' : 'Show full address'}
          onClick={() => setExpanded((open) => !open)}
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
      {expanded ? <span className={styles.full}>{address}</span> : null}
    </span>
  )
}
