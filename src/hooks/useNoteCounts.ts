// ABOUTME: useNoteCounts — how many spendable notes back each mergeable token (USDC, vault shares), read from the
// ABOUTME: SDK scan state. Settings uses it to offer "Merge notes" once a token is fragmented enough to block spends.

import { useQuery } from '@tanstack/react-query'
import { readSdkNoteCounts } from '@/lib/shielded/sdk-read'
import type { MergeToken } from '@/lib/shielded/merge-intent'

/**
 * The per-token spendable note counts, or null until read / while disabled. `balanceKey` should change
 * whenever balances do, so the counts follow the wallet (a merge, a receive). Local read — no RPC.
 */
export function useNoteCounts(enabled: boolean, balanceKey: string): Record<MergeToken, number> | null {
  const query = useQuery({
    queryKey: ['note-counts', balanceKey],
    queryFn: readSdkNoteCounts,
    enabled,
    retry: false,
  })
  return enabled ? query.data ?? null : null
}
