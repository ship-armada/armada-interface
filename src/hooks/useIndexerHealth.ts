// ABOUTME: useIndexerHealth — React Query wrapper around the indexer /health probe for the Debug pill.
// ABOUTME: Reachability-only (the endpoint has no status body); conservative 60s cadence, visibility-gated.

import { useQuery } from '@tanstack/react-query'
import { fetchIndexerHealth, isIndexerConfigured, type IndexerHealth } from '@/lib/indexer'

export interface UseIndexerHealthOptions {
  /** When false, the query is paused. Defaults to true. */
  enabled?: boolean
}

/**
 * Subscribe to the indexer's `/health` reachability. Mirrors `useRelayerHealth`'s shape, but the
 * indexer `/health` carries no status body, so this reports reachable-vs-unreachable only. A total
 * failure surfaces as `error` (treat as unreachable).
 */
export function useIndexerHealth(opts: UseIndexerHealthOptions = {}) {
  const isConfigured = isIndexerConfigured()
  const query = useQuery<IndexerHealth>({
    queryKey: ['indexer-health'],
    queryFn: ({ signal }) => fetchIndexerHealth(signal),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: opts.enabled !== false && isConfigured,
    retry: 1,
    staleTime: 30_000,
  })

  return {
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isReachable: !query.error && query.data?.reachable === true,
    /** False when no indexer URL is configured for this build (RPC-only sync). */
    isConfigured,
    refetch: query.refetch,
  }
}
