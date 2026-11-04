// ABOUTME: Reads settled tx history from txListAtom and derives the Send flow's recent-recipients list + a per-address send count.
// ABOUTME: Thin wrappers so components stay dumb — the dedupe/sort/cap/count logic lives in lib/tx/recentRecipients.

import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { txListAtom } from '@/state/tx'
import { getNetworkConfig } from '@/config/network'
import { countSendsTo, deriveRecentRecipients, type RecentRecipient } from '@/lib/tx/recentRecipients'

/** The user's `limit` most recently used distinct recipients, newest-first. Empty when no history. */
export function useRecentRecipients(limit = 5): RecentRecipient[] {
  const records = useAtomValue(txListAtom)
  const hubChainId = getNetworkConfig().hub.chainId
  return useMemo(
    () => deriveRecentRecipients(records, { hubChainId, limit }),
    [records, hubChainId, limit],
  )
}

/** How many settled sends already went to `address` (0 for a first-time recipient). */
export function useSendCountTo(address: string): number {
  const records = useAtomValue(txListAtom)
  return useMemo(() => countSendsTo(records, address), [records, address])
}
