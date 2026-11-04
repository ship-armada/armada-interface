// ABOUTME: CopyAddressButton — an icon button that copies the FULL address (not the shortened display form) and
// ABOUTME: swaps to a check for a moment to confirm; the accessible names are overridable for views with several addresses.

import { CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import styles from './CopyAddressButton.module.css'

export interface CopyAddressButtonProps {
  address: string
  /** Accessible name before copying. */
  label?: string
  /** Accessible name while the "copied" confirmation shows. */
  copiedLabel?: string
}

export function CopyAddressButton({
  address,
  label = 'Copy address',
  copiedLabel = 'Address copied',
}: CopyAddressButtonProps) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <button
      type="button"
      className={styles.copy}
      aria-label={copied ? copiedLabel : label}
      onClick={() => void copy(address)}
    >
      {copied ? (
        <CheckIcon className={styles.copyIcon} strokeWidth={1.75} aria-hidden />
      ) : (
        <DocumentDuplicateIcon className={styles.copyIcon} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  )
}
