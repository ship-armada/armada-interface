// ABOUTME: Polls the ArmadaYieldVault's shares→assets exchange rate (USDC value of 1e18 shares) and the underlying Aave spoke's annualYieldBps via React Query — paused while tab is hidden, deduped across consumers.
// ABOUTME: Returns null until the first successful read; the modal/BalanceHero treat null as "syncing" UX. Exposes refresh() so EarnModal can pull fresh state on open + post-submit slippage protection.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect } from 'react'
import { readContract } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadYieldDeployment } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import { tabVisibleAtom } from '@/state/visibility'
import { trackError } from '@/lib/telemetry'

export interface YieldRate {
  /** USDC value (raw 6-decimal) of 1e18 shares. ConvertToShares(x) = x × 1e18 / rate. */
  rate: bigint
  /**
   * Net APY in basis points after the vault's yield fee — what the user actually earns. Derived
   * as `spoke.annualYieldBps × (10_000 - vault.yieldFeeBps) / 10_000`. The displayed percentage
   * uses this; the contract math (deposit/withdraw share conversions) uses `rate`.
   */
  apyBps: bigint
  fetchedAt: number
}

/**
 * 5-minute cadence. The earlier 30s value was wasteful: at any realistic APY the per-tick rate
 * delta is below USDC's 2-decimal display precision, so polling that hard burned RPC quota with
 * no UI signal. EarnModal supplements this with on-open and post-submit refreshes for the moments
 * where freshness actually matters.
 */
const POLL_INTERVAL_MS = 5 * 60_000
const ONE_SHARE = 1_000_000_000_000_000_000n // 1e18

const VAULT_ABI = [
  {
    type: 'function',
    name: 'convertToAssets',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'spoke',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'reserveId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'yieldFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

const SPOKE_ABI = [
  {
    type: 'function',
    name: 'getReserveData',
    stateMutability: 'view',
    inputs: [{ name: 'reserveId', type: 'uint256' }],
    outputs: [
      { name: 'underlying', type: 'address' },
      { name: 'totalShares', type: 'uint256' },
      { name: 'totalDeposited', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint256' },
      { name: 'lastUpdateTimestamp', type: 'uint256' },
      { name: 'annualYieldBps', type: 'uint256' },
      { name: 'mintableYield', type: 'bool' },
    ],
  },
] as const

export const YIELD_RATE_QUERY_KEY = ['yieldRate'] as const

export interface UseYieldRateResult {
  /** Latest rate snapshot, or null until the first successful read. */
  rate: YieldRate | null
  /** Force a fresh read (bypasses the React Query cache). Returns the new snapshot or null on failure. */
  refresh: () => Promise<YieldRate | null>
}

/**
 * Polls the vault's `convertToAssets(1e18)` rate AND the underlying spoke's `annualYieldBps`.
 *
 * Consumers can convert in either direction using `rate`:
 *   shares = usdc × 1e18 / rate
 *   usdc   = shares × rate / 1e18
 *
 * Net APY in `apyBps` is the spoke's gross annual yield reduced by the vault's `yieldFeeBps`
 * (which the protocol takes off the top during harvest). This matches what a user actually earns.
 *
 * Returns null inside `rate` until the first successful read. On RPC error React Query keeps the
 * previous value (placeholderData) so a transient blip doesn't blank the UI.
 *
 * `refresh()` is exposed so EarnModal can pull fresh state on modal open + just before submit
 * (slippage protection — `shares` is computed from the freshest rate, not whatever was cached).
 */
export function useYieldRate(): UseYieldRateResult {
  const tabVisible = useAtomValue(tabVisibleAtom)
  const queryClient = useQueryClient()

  const queryFn = useCallback(async (): Promise<YieldRate | null> => {
    const yieldDeployment = await loadYieldDeployment()
    if (!yieldDeployment) return null // yield not deployed on this network — silently no-op
    const hubChainId = getNetworkConfig().hub.chainId
    const vaultAddress = yieldDeployment.contracts.armadaYieldVault as `0x${string}`

    // Step 1: read vault-side data in parallel — rate + immutable spoke/reserveId + the fee bps.
    const [usdcPerShare, spokeAddress, reserveId, yieldFeeBps] = await Promise.all([
      readContract(wagmiConfig, {
        chainId: hubChainId,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'convertToAssets',
        args: [ONE_SHARE],
      }),
      readContract(wagmiConfig, {
        chainId: hubChainId,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'spoke',
      }),
      readContract(wagmiConfig, {
        chainId: hubChainId,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'reserveId',
      }),
      readContract(wagmiConfig, {
        chainId: hubChainId,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'yieldFeeBps',
      }),
    ])

    // Step 2: read the spoke's gross annualYieldBps.
    const reserve = await readContract(wagmiConfig, {
      chainId: hubChainId,
      address: spokeAddress as `0x${string}`,
      abi: SPOKE_ABI,
      functionName: 'getReserveData',
      args: [reserveId],
    })
    const grossAnnualBps = reserve[5] // annualYieldBps

    // Net APY = gross × (10_000 - feeBps) / 10_000. Clamp feeBps to [0, 10_000] defensively.
    const clampedFeeBps = yieldFeeBps > 10_000n ? 10_000n : yieldFeeBps
    const apyBps = (grossAnnualBps * (10_000n - clampedFeeBps)) / 10_000n

    return { rate: usdcPerShare, apyBps, fetchedAt: Date.now() }
  }, [])

  const query = useQuery({
    queryKey: YIELD_RATE_QUERY_KEY,
    queryFn,
    refetchInterval: tabVisible ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: prev => prev,
    staleTime: 0,
  })

  const refresh = useCallback(async (): Promise<YieldRate | null> => {
    try {
      const fresh = await queryFn()
      // Seed the cache so other consumers (BalanceHero) pick up the new value too.
      queryClient.setQueryData(YIELD_RATE_QUERY_KEY, fresh)
      return fresh
    } catch (err) {
      trackError('useYieldRate.refresh', err, {
        scope: 'yield.rate',
        message: 'rate refresh failed',
      })
      return null
    }
  }, [queryFn, queryClient])

  // Surface persistent fetch errors via telemetry. Wrapped in useEffect so we only emit once
  // per error transition rather than on every re-render while the error persists.
  useEffect(() => {
    if (query.error) {
      trackError('useYieldRate.query', query.error, {
        scope: 'yield.rate',
        message: 'vault rate read failed',
      })
    }
  }, [query.error])

  return { rate: query.data ?? null, refresh }
}
