// ABOUTME: Tests for lib/explorer — deliveryExplorerLink picks a cross-chain tx's DESTINATION (mint) tx link: the unshield's
// ABOUTME: `toChainId`, the hub for a cross-chain shield; null when the mint hash isn't known or the kind isn't cross-chain.

import { describe, it, expect, vi } from 'vitest'
import type { TxRecord } from './tx/types'

vi.mock('@/config/network', () => {
  const chains: Record<number, { chainId: number; name: string; explorerUrl?: string }> = {
    11155111: { chainId: 11155111, name: 'Ethereum Sepolia', explorerUrl: 'https://sepolia.etherscan.io' },
    84532: { chainId: 84532, name: 'Base Sepolia', explorerUrl: 'https://sepolia.basescan.org' },
    999: { chainId: 999, name: 'No Explorer Chain' },
  }
  return {
    getChainById: (id: number) => chains[id],
    getNetworkConfig: () => ({ hub: chains[11155111] }),
  }
})

import { deliveryExplorerLink } from './explorer'

const MINT = '0x' + 'ab'.repeat(32)

function rec(kind: TxRecord['kind'], meta: object, artifacts: object): TxRecord {
  return { kind, meta, artifacts, walletContext: { sourceChainId: 11155111 } } as unknown as TxRecord
}

describe('deliveryExplorerLink', () => {
  it('links a cross-chain unshield to its mint on the destination chain', () => {
    expect(deliveryExplorerLink(rec('unshield-xchain', { toChainId: 84532 }, { destTxHash: MINT }))).toEqual({
      url: `https://sepolia.basescan.org/tx/${MINT}`,
      chainName: 'Base Sepolia',
    })
  })

  it('links a cross-chain shield to its mint on the hub', () => {
    expect(deliveryExplorerLink(rec('shield-xchain', { fromChainId: 84532 }, { destTxHash: MINT }))).toEqual({
      url: `https://sepolia.etherscan.io/tx/${MINT}`,
      chainName: 'Ethereum Sepolia',
    })
  })

  it('is null until the mint hash is known, for same-chain kinds, and for a chain without an explorer', () => {
    expect(deliveryExplorerLink(rec('unshield-xchain', { toChainId: 84532 }, {}))).toBeNull()
    expect(deliveryExplorerLink(rec('unshield-local', {}, { destTxHash: MINT }))).toBeNull()
    expect(deliveryExplorerLink(rec('unshield-xchain', { toChainId: 999 }, { destTxHash: MINT }))).toBeNull()
  })
})
