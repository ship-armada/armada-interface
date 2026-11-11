// ABOUTME: Maps a wagmi / RainbowKit connector (by id + name) to the wallet-provider key WalletMenu's icon uses.
// ABOUTME: Returns 'metamask' / 'phantom' / 'walletconnect', or undefined for any other connector (generic icon).

import type { Connector } from 'wagmi'

export function walletProviderFromConnector(connector?: Connector): string | undefined {
  const id = connector?.id?.toLowerCase() ?? ''
  const name = connector?.name?.toLowerCase() ?? ''
  const haystack = `${id} ${name}`
  if (haystack.includes('metamask')) return 'metamask'
  if (haystack.includes('phantom')) return 'phantom'
  if (haystack.includes('walletconnect')) return 'walletconnect'
  return undefined
}
