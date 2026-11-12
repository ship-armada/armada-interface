// ABOUTME: Counterparty address display — a shielded address is 8 + 4 of the whole string (`0zk1qyqk...5xlt`),
// ABOUTME: an EVM address is "0x" + 4 + 4, as plain text with the full address in the title. Split rules live in lib/address.

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
