// ABOUTME: Polls the ArmadaYieldVault's shares→assets exchange rate (USDC value of 1e18 shares). Refreshes every 30s.
// ABOUTME: Returns null until the first successful read; the modal/BalanceHero treat null as "syncing" UX.

import { useEffect, useState } from 'react'
import { readContract } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadYieldDeployment } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import { trackError } from '@/lib/telemetry'

export interface YieldRate {
  /** USDC value (raw 6-decimal) of 1e18 shares. ConvertToShares(x) = x × 1e18 / rate. */
  rate: bigint
  fetchedAt: number
}

const POLL_INTERVAL_MS = 30_000
const ONE_SHARE = 1_000_000_000_000_000_000n // 1e18

const VAULT_ABI = [
  {
    type: 'function',
    name: 'convertToAssets',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * Polls `vault.convertToAssets(1e18)` to learn how many raw USDC units 1e18 shares are worth.
 * Consumers can convert in either direction:
 *   shares = usdc × 1e18 / rate
 *   usdc   = shares × rate / 1e18
 *
 * Returns null until the first successful read. On RPC error the previous value is kept so a
 * transient blip doesn't blank the UI.
 */
export function useYieldRate(): YieldRate | null {
  const [rate, setRate] = useState<YieldRate | null>(null)

  useEffect(() => {
    let cancelled = false

    async function tick(): Promise<void> {
      try {
        const yieldDeployment = await loadYieldDeployment()
        if (!yieldDeployment) return // yield not deployed on this network — silently no-op
        const usdcPerShare = await readContract(wagmiConfig, {
          chainId: getNetworkConfig().hub.chainId,
          address: yieldDeployment.contracts.armadaYieldVault as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'convertToAssets',
          args: [ONE_SHARE],
        })
        if (cancelled) return
        setRate({ rate: usdcPerShare, fetchedAt: Date.now() })
      } catch (err) {
        trackError('useYieldRate.tick', err, {
          scope: 'yield.rate',
          message: 'vault rate read failed',
        })
      }
    }

    void tick()
    const interval = window.setInterval(() => void tick(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return rate
}
