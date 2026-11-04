// ABOUTME: CopyableAddress — a summary row's address: the shortened form (`ui/AddressText`, full address in the title)
// ABOUTME: with a `ui/CopyAddressButton` beside it that copies the FULL address.

import { AddressText } from '@/components/ui/AddressText'
import { CopyAddressButton, type CopyAddressButtonProps } from '@/components/ui/CopyAddressButton'
import styles from './CopyableAddress.module.css'

export type CopyableAddressProps = CopyAddressButtonProps

export function CopyableAddress({ address, label, copiedLabel }: CopyableAddressProps) {
  return (
    <span className={styles.line}>
      <AddressText address={address} />
      <CopyAddressButton address={address} label={label} copiedLabel={copiedLabel} />
    </span>
  )
}
