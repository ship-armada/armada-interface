// ABOUTME: CopyableAddress — a summary row's shortened address that copies the FULL address.
// ABOUTME: Review rows keep a copy icon; a receipt uses the underlined address itself, with a Copy tooltip.

import { Tooltip } from '@/design'
import { shortAddress } from '@/lib/address'
import { AddressText } from '@/components/ui/AddressText'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { CopyAddressButton, type CopyAddressButtonProps } from '@/components/ui/CopyAddressButton'
import styles from './CopyableAddress.module.css'

export interface CopyableAddressProps extends CopyAddressButtonProps {
  /** `icon` sits a copy button beside the address. `link` is the receipt: the address is the control. */
  presentation?: 'icon' | 'link'
  /** Text shown on the control. Defaults to the shortened address. */
  display?: string
}

export function CopyableAddress({ address, label, copiedLabel, presentation = 'icon', display }: CopyableAddressProps) {
  if (presentation === 'link') {
    return <CopyAddressLink address={address} label={label} copiedLabel={copiedLabel} display={display} />
  }
  return (
    <span className={styles.line}>
      <AddressText address={address} />
      <CopyAddressButton address={address} label={label} copiedLabel={copiedLabel} />
    </span>
  )
}

function CopyAddressLink({
  address,
  label = 'Copy address',
  copiedLabel = 'Address copied',
  display,
}: CopyAddressButtonProps & { display?: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <Tooltip variant="action" content={copied ? 'Copied' : 'Copy'}>
      <button
        type="button"
        className={styles.link}
        aria-label={copied ? copiedLabel : label}
        onClick={() => void copy(address)}
      >
        {display ?? shortAddress(address)}
      </button>
    </Tooltip>
  )
}
