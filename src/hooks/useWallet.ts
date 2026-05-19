// ABOUTME: Bridges wagmi state to a single ergonomic shape: { address, chainId, signer | null }.
// ABOUTME: `signer` is ethers v6 (via walletClientToSigner); use it for contract writes.

import { useEffect, useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { useAccount, useDisconnect, useWalletClient } from 'wagmi'
import type { JsonRpcSigner } from 'ethers'
import { walletClientToSigner } from '@/lib/wagmi-adapter'
import { evmAddressAtom } from '@/state/wallet'
import { track } from '@/lib/telemetry'

export interface UseWalletResult {
  address: string | null
  chainId: number | null
  isConnected: boolean
  signer: JsonRpcSigner | null
  disconnect: () => void
}

export function useWallet(): UseWalletResult {
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { disconnect } = useDisconnect()
  const setEvmAddress = useSetAtom(evmAddressAtom)

  const signer = useMemo(() => {
    if (!walletClient) return null
    try {
      return walletClientToSigner(walletClient)
    } catch {
      return null
    }
  }, [walletClient])

  useEffect(() => {
    setEvmAddress(address ?? null)
    // Telemetry: emit chainId only — EVM address is sensitive and excluded by EventRegistry.
    if (address) track('wallet.connected', { chainId: chainId ?? null })
    else track('wallet.disconnected', {})
  }, [address, chainId, setEvmAddress])

  return {
    address: address ?? null,
    chainId: chainId ?? null,
    isConnected,
    signer,
    disconnect,
  }
}
