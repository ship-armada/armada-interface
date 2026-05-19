// ABOUTME: Bridges lib/railgun/sync's SDK balance events into shieldedUsdcAtom + drives an initial scan on unlock.
// ABOUTME: Mount once at App root (alongside useTabVisible, useAutoLock, etc.). No-op when locked; auto-resubscribes on unlock.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeShieldedWalletAtom, shieldedUsdcAtom } from '@/state/wallet'
import { loadDeployments } from '@/config/deployments'
import {
  getShieldedERC20Balance,
  refreshShieldedBalances,
  subscribeBalanceUpdates,
} from '@/lib/railgun/sync'
import { trackError } from '@/lib/telemetry'

/**
 * Subscribe to balance updates while the wallet is unlocked. On unlock:
 *   1. Resolve the hub USDC token address from the deployment manifest
 *   2. Subscribe to SDK balance-update events (lazily installs the global SDK callback)
 *   3. Trigger an initial `refreshShieldedBalances` so the first scan starts
 *   4. On each event (or initial query), re-fetch the wallet's USDC balance + write the atom
 *
 * On lock or unmount, unsubscribes and zeroes the atom (`null`) so consumers can distinguish
 * "no wallet" from "wallet with 0 balance".
 *
 * The `latestWalletIdRef` guards against stale-closure writes if the wallet flips while a
 * balance query is in flight — only the most recent walletId is allowed to write the atom.
 */
export function useShieldedBalanceSync(): void {
  const active = useAtomValue(activeShieldedWalletAtom)
  const setShieldedUsdc = useSetAtom(shieldedUsdcAtom)
  const latestWalletIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (active?.status !== 'unlocked') {
      // Lock / reset path — drop balance state so stale data doesn't linger past a session.
      latestWalletIdRef.current = null
      setShieldedUsdc(null)
      return
    }

    const walletId = active.id
    latestWalletIdRef.current = walletId
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    async function refreshUsdc(): Promise<void> {
      try {
        const deployments = await loadDeployments()
        const usdcAddress = deployments.hub.cctp.usdc
        if (!usdcAddress) return
        const balance = await getShieldedERC20Balance(walletId, usdcAddress)
        if (cancelled || latestWalletIdRef.current !== walletId) return
        setShieldedUsdc(balance)
      } catch (err) {
        trackError('useShieldedBalanceSync.refreshUsdc', err, {
          scope: 'shielded.balance',
          message: 'usdc balance query failed',
        })
      }
    }

    // Order: subscribe FIRST (so a fast scan completion isn't missed), then kick off refresh.
    void (async () => {
      try {
        unsubscribe = await subscribeBalanceUpdates(() => {
          void refreshUsdc()
        })
        if (cancelled) {
          unsubscribe()
          return
        }
        await refreshShieldedBalances(walletId)
        // Trigger one immediate query so the UI shows the current cached balance while the
        // scan runs (scans can take seconds; the SDK already has any previously-scanned UTXOs
        // persisted in IDB and ready to read).
        await refreshUsdc()
      } catch (err) {
        trackError('useShieldedBalanceSync.init', err, {
          scope: 'shielded.balance',
          message: 'subscribe + initial scan failed',
        })
      }
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [active?.id, active?.status, setShieldedUsdc])
}
