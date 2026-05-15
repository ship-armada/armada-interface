// ABOUTME: Adapts a viem WalletClient (from wagmi) into an ethers v6 JsonRpcSigner.
// ABOUTME: Duplicated from crowdfund-ui/packages/committer/src/lib/wagmiAdapter.ts.

import { BrowserProvider, JsonRpcSigner } from 'ethers'
import type { WalletClient } from 'viem'

export function walletClientToSigner(walletClient: WalletClient): JsonRpcSigner {
  const { account, chain, transport } = walletClient
  if (!chain) throw new Error('WalletClient has no chain')
  if (!account) throw new Error('WalletClient has no account')

  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  }
  const provider = new BrowserProvider(transport, network)
  return new JsonRpcSigner(provider, account.address)
}
