// ABOUTME: Polls the ArmadaYieldVault's shares→assets exchange rate (USDC value of 1e18 shares) via React Query — paused while tab is hidden, deduped across consumers.
// ABOUTME: Returns null until the first successful read; the modal/BalanceHero treat null as "syncing" UX.

import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { readContract } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadYieldDeployment } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import { tabVisibleAtom } from '@/state/visibility'
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

export const YIELD_RATE_QUERY_KEY = ['yieldRate'] as const

/**
 * Polls `vault.convertToAssets(1e18)` to learn how many raw USDC units 1e18 shares are worth.
 * Consumers can convert in either direction:
 *   shares = usdc × 1e18 / rate
 *   usdc   = shares × rate / 1e18
 *
 * Returns null until the first successful read. On RPC error React Query keeps the previous value
 * (placeholderData) so a transient blip doesn't blank the UI.
 */
export function useYieldRate(): YieldRate | null {
  const tabVisible = useAtomValue(tabVisibleAtom)

  const query = useQuery({
    queryKey: YIELD_RATE_QUERY_KEY,
    queryFn: async (): Promise<YieldRate | null> => {
      const yieldDeployment = await loadYieldDeployment()
      if (!yieldDeployment) return null // yield not deployed on this network — silently no-op
      const usdcPerShare = await readContract(wagmiConfig, {
        chainId: getNetworkConfig().hub.chainId,
        address: yieldDeployment.contracts.armadaYieldVault as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'convertToAssets',
        args: [ONE_SHARE],
      })
      return { rate: usdcPerShare, fetchedAt: Date.now() }
    },
    refetchInterval: tabVisible ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    // Keep showing the previous value through a failed refetch so the UI doesn't blank on a
    // transient RPC blip. The first failure surfaces via the error effect below.
    placeholderData: prev => prev,
    staleTime: 0,
  })

  if (query.error) {
    trackError('useYieldRate.query', query.error, {
      scope: 'yield.rate',
      message: 'vault rate read failed',
    })
  }

  return query.data ?? null
}
