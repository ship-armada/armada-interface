// ABOUTME: Bridges lib/shielded/sync's SDK balance events into the shielded USDC / yield-share atoms and the held spends (for the projected headline); drives an initial scan on unlock.
// ABOUTME: Mount once at App root. No-op when locked; auto-resubscribes on unlock.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  activeShieldedWalletAtom,
  heldSpendTxidsAtom,
  scannedThroughAtom,
  shieldedUsdcAtom,
  shieldedUsdcSpendableAtom,
  syncRetryEpochAtom,
  syncStateAtom,
  yieldSharesAtom,
} from '@/state/wallet'
import {
  refreshShieldedBalances,
  subscribeBalanceUpdates,
  subscribeScanStatus,
} from '@/lib/shielded/sync'
import {
  closeSdkRead,
  readSdkHeldSpendTxids,
  readSdkSyncedThrough,
  readSdkUsdcBalance,
  readSdkYieldShares,
} from '@/lib/shielded/sdk-read'
import { trackError } from '@/lib/telemetry'

/**
 * Subscribe to balance updates while the wallet is unlocked. On unlock:
 *   1. Subscribe to SDK scan-status events → drive `syncStateAtom` for the INITIAL load only
 *      (background polls don't revert it — see the subscription below)
 *   2. Subscribe to the balance bus (the SDK wallet's balance / note / scan events, plus spend-hold pings)
 *   3. Trigger an initial `refreshShieldedBalances` so the first scan starts
 *   4. On each event (or initial query), READ (not sync) BOTH shielded USDC and ayUSDC shares from
 *      the @armada/sdk scan state (which resolves the token set from the deployment internally)
 *
 * On lock or unmount, unsubscribes, clears the balance atoms (to null), and closes the SDK read instance.
 *
 * The `latestWalletIdRef` guards against stale-closure writes if the wallet flips while a
 * balance query is in flight — only the most recent walletId is allowed to write atoms.
 */
export function useShieldedBalanceSync(): void {
  const active = useAtomValue(activeShieldedWalletAtom)
  const setShieldedUsdc = useSetAtom(shieldedUsdcAtom)
  const setShieldedUsdcSpendable = useSetAtom(shieldedUsdcSpendableAtom)
  const setYieldShares = useSetAtom(yieldSharesAtom)
  const setHeldSpendTxids = useSetAtom(heldSpendTxidsAtom)
  const setScannedThrough = useSetAtom(scannedThroughAtom)
  const setSyncState = useSetAtom(syncStateAtom)
  // Bumped by useSyncRetry ("Try Again"). Included in the effect deps so a bump re-runs the
  // subscribe + initial-scan path below.
  const retryEpoch = useAtomValue(syncRetryEpochAtom)
  const latestWalletIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (active?.status !== 'unlocked') {
      // Lock / reset / account-switch path — drop balance state so stale data doesn't linger past
      // a session, AND reset the sync state to idle. Without the sync reset, the NEXT wallet
      // inherits this one's 'complete' status, so its dashboard renders ungated with a null
      // balance and enabled spend buttons until its own first scan event fires. (W-1)
      latestWalletIdRef.current = null
      setShieldedUsdc(null)
      setShieldedUsdcSpendable(null)
      setYieldShares(null)
      setHeldSpendTxids([])
      setScannedThrough(null)
      setSyncState({ status: 'idle', progress: 0 })
      // This hook owns the @armada/sdk read instance — tear it down on lock.
      void closeSdkRead()
      return
    }

    const walletId = active.id
    latestWalletIdRef.current = walletId
    let unsubscribe: (() => void) | null = null
    let unsubscribeScan: (() => void) | null = null
    let cancelled = false

    // Drive the INITIAL-load syncing card/banner (`syncStateAtom`) off the SDK wallet's scan lifecycle:
    // scan:started → syncing, scan:progress → the running fraction, scan:complete → complete,
    // scan:error → failed. `syncStateAtom` tracks the initial load ONLY. After the first `complete`,
    // the 15s poll keeps syncing the chain in the background, but those routine scan:started/complete
    // blips are ignored here — otherwise the full "Loading your private balance" UI (SyncCard /
    // SyncBanner) would flicker to the progress display on every poll. A fresh unlock or a "Try Again"
    // retry re-runs this effect with `initialSyncComplete` reset, which re-arms the display.
    let initialSyncComplete = false
    unsubscribeScan = subscribeScanStatus((status) => {
      if (cancelled || latestWalletIdRef.current !== walletId) return
      if (initialSyncComplete) return // steady state: background syncs must not revert the UI
      setSyncState(status)
      if (status.status === 'complete') initialSyncComplete = true
    })

    async function refreshAll(): Promise<void> {
      try {
        // READ shielded USDC + yield-vault shares from the @armada/sdk scan state in parallel — no
        // sync. This runs from the balance-bus subscription, which fires BECAUSE a sync just
        // completed; re-syncing here would be circular (a sync emits scan:complete → this read →
        // another sync → …). Syncing is driven only by the poll + post-tx refresh + initial scan.
        // Promise.allSettled so one chain hiccup doesn't blank the other atom.
        // The held spends and the scan position are read with the balances, so the projected headline
        // (state/balanceProjection) adds exactly what these balances leave out — a held spend's change, an unscanned
        // shield's note — with no gap and no double count when one confirms.
        const [usdcResult, sharesResult, heldResult, scannedResult] = await Promise.allSettled([
          readSdkUsdcBalance(),
          readSdkYieldShares(),
          readSdkHeldSpendTxids(),
          readSdkSyncedThrough(),
        ])

        if (cancelled || latestWalletIdRef.current !== walletId) return

        if (usdcResult.status === 'fulfilled') {
          // `shieldedUsdcAtom` is the TOTAL (the headline adds held spends' change — state/balanceProjection);
          // `shieldedUsdcSpendableAtom` is what MAX + the fee-on-top guard draw from, so a pending (not-yet-final)
          // note can't be spent.
          setShieldedUsdc(usdcResult.value.spendable + usdcResult.value.pending)
          setShieldedUsdcSpendable(usdcResult.value.spendable)
        }
        if (sharesResult.status === 'fulfilled') {
          setYieldShares(sharesResult.value.position)
        }
        if (heldResult.status === 'fulfilled') {
          setHeldSpendTxids(heldResult.value)
        }
        if (scannedResult.status === 'fulfilled') {
          setScannedThrough(scannedResult.value)
        }
      } catch (err) {
        trackError('useShieldedBalanceSync.refreshAll', err, {
          scope: 'shielded.balance',
          message: 'balance query failed',
        })
      }
    }

    // Order: subscribe FIRST (so a fast scan completion isn't missed), then kick off refresh.
    void (async () => {
      try {
        unsubscribe = await subscribeBalanceUpdates(() => {
          void refreshAll()
        })
        if (cancelled) {
          unsubscribe()
          return
        }
        await refreshShieldedBalances(walletId)
        await refreshAll()
      } catch (err) {
        // The scan never started (e.g. RPC unreachable), so the SDK won't emit `scan:error` to
        // mark the sync failed. Mark it here so the gate can offer Try Again.
        if (!cancelled && latestWalletIdRef.current === walletId) {
          setSyncState({ status: 'failed', progress: 0 })
        }
        trackError('useShieldedBalanceSync.init', err, {
          scope: 'shielded.balance',
          message: 'subscribe + initial scan failed',
        })
      }
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
      if (unsubscribeScan) unsubscribeScan()
    }
  }, [active?.id, active?.status, retryEpoch, setShieldedUsdc, setYieldShares, setSyncState])
}
