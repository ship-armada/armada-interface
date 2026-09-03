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
 * Retries per /health poll before a failed poll is believed (→ isDegraded). Smooths transient
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
 * Subscribe to the relayer's /health snapshot. Returns the parsed response + a `isDegraded`
 * convenience derived value — `true` when the relayer reports `stale` or `unhealthy`. Modals use
 * `isDegraded` to surface the wallet-override banner.
 *
 * Failures (relayer entirely unreachable) surface as `data: undefined` + an `error`. Treat the
 * total-unreachable state as the most-degraded signal — same UX as `unhealthy`.
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
    staleTime: 30_000,
  })

  const data = query.data
  const isDegraded =
    // `query.error` is only set once a poll's retries are exhausted (see HEALTH_POLL_RETRIES), so
    // this reflects a sustained unreachable relayer, not a single dropped request.
    !!query.error || // unreachable → degrade
    (data ? data.status === 'stale' || data.status === 'unhealthy' : false)

  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isDegraded,
    /** False when no relayer URL is configured for this build — callers render a distinct
     *  "relayer not configured" state rather than a transient "degraded". (P0-10) */
    isConfigured,
    refetch: query.refetch,
  }
}
