// ABOUTME: Polls connected wallet's public USDC balance on the hub chain + writes into usdcBalancesAtom.
// ABOUTME: Mount once at App root. Skips polling when the wallet is disconnected or deployments aren't resolved yet.

import { useEffect, useRef } from 'react'
import { useSetAtom } from 'jotai'
import { erc20Abi } from 'viem'
import { readContract } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { useWallet } from '@/hooks/useWallet'
import { loadDeployments } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import { usdcBalancesAtom } from '@/state/wallet'
import { trackError } from '@/lib/telemetry'

const POLL_INTERVAL_MS = 15_000

/**
 * Reads the connected wallet's hub USDC balance every 15s and mirrors it into
 * `usdcBalancesAtom[hubChainId]`. The ShieldModal reads this atom to populate its MAX.
 *
 * Today we only poll the hub. Client chains will be added when the cross-chain shield flow
 * lands (those need their own per-chain JsonRpcProvider; we already have the addresses in
 * the deployment manifest).
 */
export function useUsdcBalances(): void {
  const { address } = useWallet()
  const setBalances = useSetAtom(usdcBalancesAtom)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!address) {
      setBalances({}) // clear when wallet disconnects
      return
    }

    const hubChainId = getNetworkConfig().hub.chainId
    let cancelled = false

    async function tick(): Promise<void> {
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const deployments = await loadDeployments()
        const usdcAddress = deployments.hub.cctp.usdc as `0x${string}`
        const balance = await readContract(wagmiConfig, {
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
          chainId: hubChainId,
        })
        if (cancelled) return
        setBalances(prev => ({ ...prev, [hubChainId]: balance }))
      } catch (err) {
        trackError('useUsdcBalances.tick', err, {
          scope: 'usdc.balance',
          message: 'hub usdc balance read failed',
        })
      } finally {
        inFlightRef.current = false
      }
    }

    void tick() // immediate read on mount / address change
    const interval = window.setInterval(() => void tick(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [address, setBalances])
}
