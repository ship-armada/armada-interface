// ABOUTME: Indexer (quick-sync watcher) client — base-URL resolution + a lightweight /health probe.
// ABOUTME: Backs the Debug page's indexer health pill; the SDK owns the actual /v2/quick-sync calls.

import { getNetworkConfig } from '@/config/network'

/** Configured indexer base URL, or null when the build runs RPC-only sync (no VITE_INDEXER_URL). */
export function getIndexerUrl(): string | null {
  return getNetworkConfig().indexerUrl
}

/** True when an indexer URL is configured — callers gate the health probe + pill on this. */
export function isIndexerConfigured(): boolean {
  return getIndexerUrl() !== null
}

export interface IndexerHealth {
  reachable: boolean
}

/**
 * Probe the indexer's `/health` endpoint. Resolves `{ reachable: true }` on a 2xx; throws otherwise
 * so a React Query consumer surfaces the unreachable state. The endpoint carries no status body, so
 * only the status code is inspected — reachability, not a health grade. AbortSignal forwards to
 * fetch for cancel-on-unmount.
 */
export async function fetchIndexerHealth(signal?: AbortSignal): Promise<IndexerHealth> {
  const base = getIndexerUrl()
  if (base === null) throw new Error('indexer not configured')
  const res = await fetch(`${base.replace(/\/+$/, '')}/health`, { method: 'GET', signal })
  if (!res.ok) throw new Error(`indexer /health responded ${res.status}`)
  return { reachable: true }
}
