// ABOUTME: Periodic @armada/sdk wallet.sync() driver — replaces the stock engine's internal scan poller
// ABOUTME: so live balance + incoming-transfer updates keep flowing. Visibility-gated. Mount once at App root.

import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { activeShieldedWalletAtom } from '@/state/wallet'
import { tabVisibleAtom } from '@/state/visibility'
import { activeTxListAtom, pendingTxsAtom } from '@/state/tx'
import { refreshShieldedBalances } from '@/lib/shielded/sync'

// Steady-state cadence for the background scan. The SDK's sync is a cheap no-op (`scanned:false`) when
// the chain head hasn't advanced, so a tight-ish interval keeps received transfers fresh without cost.
const SYNC_POLL_INTERVAL_MS = 15_000

// In-flight cadence: while a tx is still running, poll fast so the balance reflects the note the moment
// it lands on-chain — independent of when the (possibly slow/overloaded) relayer finally reports the tx
// as complete. Deliberately gentler than the post-completion cadence because an in-flight tx can last
// minutes on a laggy relayer, and the quick-sync endpoint IS that same server (don't pile on).
const IN_FLIGHT_POLL_INTERVAL_MS = 5_000

// Catch-up cadence: for a short window after a tx completes, poll fast so the authoritative chain
// balance (and the spendable subset behind MAX / the fee-on-top guard) converges within seconds
// instead of waiting for the next steady-state tick.
const CATCHUP_POLL_INTERVAL_MS = 3_000
const CATCHUP_WINDOW_MS = 60_000

/**
 * The next sync interval (ms), or `false` to stop polling. Tightens to the in-flight cadence while a tx
 * is running, to the catch-up cadence for `CATCHUP_WINDOW_MS` after the most recent tx completed, then
 * relaxes to steady state. Pure so the cadence decision is unit-testable without React Query timers.
 */
export function nextSyncInterval(
  enabled: boolean,
  latestCompletedAt: number,
  now: number,
  hasPendingTx: boolean,
): number | false {
  if (!enabled) return false
  if (hasPendingTx) return IN_FLIGHT_POLL_INTERVAL_MS
  if (now - latestCompletedAt < CATCHUP_WINDOW_MS) return CATCHUP_POLL_INTERVAL_MS
  return SYNC_POLL_INTERVAL_MS
}

/**
 * Drive `wallet.sync()` on an interval while the wallet is unlocked and the tab is visible. Each sync
 * emits the SDK's scan/balance/note events, which the balance bus fans out to `useShieldedBalanceSync`
 * (re-reads balances) and `useIncomingTransferDetector` (re-runs history recovery). This is what keeps
 * the shielded view live now that the stock engine's continuous scan is being retired. The interval
 * tightens to `IN_FLIGHT_POLL_INTERVAL_MS` while a tx is running, to `CATCHUP_POLL_INTERVAL_MS` for
 * `CATCHUP_WINDOW_MS` after the most recent tx completes, then relaxes to `SYNC_POLL_INTERVAL_MS`.
 */
export function useShieldedSyncPoll(): void {
  const active = useAtomValue(activeShieldedWalletAtom)
  const tabVisible = useAtomValue(tabVisibleAtom)
  const txList = useAtomValue(activeTxListAtom)
  const pendingTxs = useAtomValue(pendingTxsAtom)
  const enabled = active?.status === 'unlocked' && tabVisible

  // Completion time (`updatedAt`) of the most recently completed tx. Held in a ref so the
  // `refetchInterval` callback — which React Query re-invokes after every fetch — reads the latest
  // value and steps the cadence down on its own once the catch-up window lapses, no timer needed.
  const latestCompletedAt = useMemo(() => {
    let max = 0
    for (const record of txList) {
      if (record.executionState === 'completed' && record.updatedAt > max) max = record.updatedAt
    }
    return max
  }, [txList])
  const latestCompletedAtRef = useRef(latestCompletedAt)
  latestCompletedAtRef.current = latestCompletedAt

  // Same ref pattern for the in-flight flag so the `refetchInterval` callback reads the current value.
  const hasPendingTxRef = useRef(pendingTxs.length > 0)
  hasPendingTxRef.current = pendingTxs.length > 0

  useQuery({
    queryKey: ['shielded-sync-poll', active?.id ?? null],
    queryFn: async () => {
      await refreshShieldedBalances()
      return Date.now()
    },
    enabled,
    refetchInterval: () =>
      nextSyncInterval(enabled, latestCompletedAtRef.current, Date.now(), hasPendingTxRef.current),
    refetchIntervalInBackground: false,
    // The value is irrelevant — this query is a side-effecting poller, not a data source.
    staleTime: Infinity,
    gcTime: 0,
  })
}
