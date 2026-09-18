// ABOUTME: useRelayerHealth — React Query wrapper around /health for the modal banner + Settings auto-surface.
// ABOUTME: Conservative polling — modals only need health at submit-time, so a 60s interval is enough; visibility-gated to avoid background drain.

import { useQuery } from '@tanstack/react-query'
import { fetchHealth, type RelayerHealthResponse } from '@/lib/relayer'
import { isRelayerConfigured } from '@/config/network'

export interface UseRelayerHealthOptions {
  /**
   * When false, the query is paused. Used by modal callers to only poll while the modal is open.
   * Defaults to true.
   */
  enabled?: boolean
}

/**
 * Retries per /health poll before a failed poll is believed (→ isUnreachable). Smooths transient
 * network blips / a momentarily slow (>10s) relayer so the "can't find a relayer" banner reflects
 * a sustained failure rather than a single dropped request — the previous `retry: 1` (2 attempts,
 * ~1s apart) tripped the banner on any dip that outlasted a second or two. 2 retries = 3 attempts,
 * spread over ~9s by `retryDelay` below: long enough to outlast a brief dip, short enough that a
 * genuine outage still surfaces within the same 60s poll (every attempt keeps failing).
 *
 * NOTE: React Query resets `failureCount` at the start of each poll, so this smoothing is
 * per-poll (across the attempts of one fetch), NOT a cross-poll counter. That's why we can't
 * mirror `useFees`'s `failureCount >= N` threshold here — `useFees` relies on infinite `retry`
 * keeping a single fetch alive across all its attempts.
 */
const HEALTH_POLL_RETRIES = 2

/**
 * Subscribe to the relayer's /health snapshot. Returns the parsed response + two derived signals:
 *
 *   - `isUnreachable` — the actor couldn't be reached after this poll's retries. This is the ONLY
 *     state in which a transaction genuinely can't be broadcast, so it's what the "can't find a
 *     relayer" banner keys on. `/health`'s `status` field is deliberately NOT used here: it reflects
 *     the watcher/indexer's freshness (`stale`/`unhealthy`; see the actor's `classifyChain`), while
 *     `/relay` (broadcast) and `/status` are direct RPC ops that work regardless of indexer freshness.
 *   - `isIndexerStalled` — the indexer is badly behind (`status === 'unhealthy'`). This only affects
 *     CROSS-CHAIN delivery (discovered from indexed events, with a ~120s direct-RPC fallback), so
 *     it's surfaced as an xchain-only "delivery may be delayed" advisory, never as a broadcast block.
 */
export function useRelayerHealth(opts: UseRelayerHealthOptions = {}) {
  // No relayer configured (sepolia + unset VITE_RELAYER_URL) → don't poll /health against the
  // empty/own-origin URL; callers branch on `isConfigured` to show a "not configured" state. (P0-10)
  const isConfigured = isRelayerConfigured()
  const query = useQuery<RelayerHealthResponse>({
    queryKey: ['relayer-health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: opts.enabled !== false && isConfigured,
    // Retry a failed poll a few times before believing the relayer is unreachable, so a single
    // dropped request / cold-VPS hiccup / momentarily slow response doesn't trip the banner on the
    // next render. See HEALTH_POLL_RETRIES — retries are spaced (3s, 6s, capped 8s) so they ride
    // out a brief dip without masking a sustained outage (which fails every attempt).
    retry: HEALTH_POLL_RETRIES,
    retryDelay: attemptIndex => Math.min(3_000 * (attemptIndex + 1), 8_000),
    // Modals gate on this snapshot at open-time, so it must reflect the CURRENT relayer state, not a
    // ≤30s-old poll — otherwise a transient blip an earlier poll caught sticks in a briefly-opened
    // modal until a page refresh. `staleTime: 0` + refetch-on-mount forces a fresh read each open.
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const data = query.data

  // `query.error` is only set once a poll's retries are exhausted (see HEALTH_POLL_RETRIES), so this
  // reflects a SUSTAINED unreachable actor — the only state where a tx genuinely can't be broadcast.
  const isUnreachable = !!query.error

  // Indexer badly behind (`unhealthy` = >10× poll interval). Relevant ONLY to cross-chain delivery
  // (indexed-event discovery + ~120s RPC fallback), never to broadcast. `stale` is deliberately
  // ignored — it's routine watcher lag, not an availability signal.
  const isIndexerStalled = data?.status === 'unhealthy'

  // A positive, non-errored health snapshot — the relayer is known-reachable right now.
  const isAvailable = data !== undefined && !isUnreachable
  // A probe is in flight with no conclusive reachable result yet: the initial open (before the
  // first poll settles) OR a "Check again" refetch after an outage. `isUnreachable` only flips true
  // AFTER the ~9s of retries exhaust, and `refetch` drops the prior error — so without this signal
  // the banner blanks (reads as "resolved") and the shield commits to the direct path prematurely
  // during that window. Callers surface a neutral "looking for a relayer" state instead. Excludes
  // the routine 60s background poll while healthy (`isAvailable` is still true then).
  const isChecking = isConfigured && query.isFetching && !isAvailable

  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    /** Actor unreachable after retries — drives the "can't broadcast" banner + gasless-path gating. */
    isUnreachable,
    /** A probe is in flight with no conclusive result yet (initial open / post-"Check again"
     *  refetch) — drives the neutral "looking for a relayer" state so the banner never blanks and
     *  the shield doesn't advertise the direct path before we know it's needed. */
    isChecking,
    /** Indexer badly behind — drives the cross-chain "delivery may be delayed" advisory only. */
    isIndexerStalled,
    /** False when no relayer URL is configured for this build — callers render a distinct
     *  "relayer not configured" state rather than a transient "degraded". (P0-10) */
    isConfigured,
    refetch: query.refetch,
  }
}
