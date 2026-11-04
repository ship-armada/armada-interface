// ABOUTME: Counterparty address display — shortened to its fixed prefix ("0zk1" / "0x") + the head and tail a user verifies
// ABOUTME: (0zk: 8 + 6, 0x: 4 + 4), as plain text with the full address in the title. Split rules live in lib/address.

import { shortAddress } from '@/lib/address'

export interface AddressTextProps {
  address: string
  className?: string
}

export function AddressText({ address, className }: AddressTextProps) {
  const short = shortAddress(address)
  return (
    <span className={className} title={short === address ? undefined : address}>
      {short}
    </span>
  )
}
