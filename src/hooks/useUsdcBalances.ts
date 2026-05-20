// ABOUTME: Polls connected wallet's public USDC balance on every configured chain + writes into usdcBalancesAtom.
// ABOUTME: Mount once at App root. Skips polling when the wallet is disconnected or deployments aren't resolved yet.

import { useEffect, useRef } from 'react'
import { useSetAtom } from 'jotai'
import { erc20Abi } from 'viem'
import { readContract } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { useWallet } from '@/hooks/useWallet'
import { loadDeployments } from '@/config/deployments'
import { usdcBalancesAtom } from '@/state/wallet'
import { trackError } from '@/lib/telemetry'

const POLL_INTERVAL_MS = 15_000

/**
 * Build the (chainId, usdcAddress) list from the resolved deployments. Hub + every client
 * deployment carries its own `cctp.usdc` — pull them all so the ShieldModal's MAX is populated
 * regardless of which `fromChainId` the user selects.
 */
function chainUsdcPairs(
  deployments: Awaited<ReturnType<typeof loadDeployments>>,
): Array<{ chainId: number; usdcAddress: `0x${string}` }> {
  const pairs: Array<{ chainId: number; usdcAddress: `0x${string}` }> = [
    { chainId: deployments.hub.chainId, usdcAddress: deployments.hub.cctp.usdc as `0x${string}` },
  ]
  for (const client of deployments.clients) {
    pairs.push({ chainId: client.chainId, usdcAddress: client.cctp.usdc as `0x${string}` })
  }
  return pairs
}

/**
 * Reads the connected wallet's public USDC balance on every configured chain (hub + clients)
 * every 15s and mirrors them into `usdcBalancesAtom`. The ShieldModal reads this atom to
 * populate its MAX based on the currently-selected `fromChainId`.
 *
 * Per-chain reads go through `readContract({ chainId })` so wagmi picks the right transport
 * for each chain — no manual `JsonRpcProvider` plumbing needed.
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

    let cancelled = false

    async function tick(): Promise<void> {
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const deployments = await loadDeployments()
        const pairs = chainUsdcPairs(deployments)
        // Read all chains in parallel — Promise.allSettled so one chain's RPC hiccup doesn't
        // wipe out the other chains' results.
        const results = await Promise.allSettled(
          pairs.map(({ chainId, usdcAddress }) =>
            readContract(wagmiConfig, {
              address: usdcAddress,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
              chainId,
            }).then(balance => ({ chainId, balance })),
          ),
        )
        if (cancelled) return
        setBalances(prev => {
          const next = { ...prev }
          for (const r of results) {
            if (r.status === 'fulfilled') {
              next[r.value.chainId] = r.value.balance
            }
          }
          return next
        })
        // Surface partial failures once per tick — useful when one RPC is flaky but the others work.
        const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
        if (rejected.length > 0) {
          trackError('useUsdcBalances.tick', rejected[0]!.reason, {
            scope: 'usdc.balance',
            message: `${rejected.length}/${pairs.length} chain reads failed`,
          })
        }
      } catch (err) {
        trackError('useUsdcBalances.tick', err, {
          scope: 'usdc.balance',
          message: 'usdc balance poll failed',
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
