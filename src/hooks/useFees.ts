// ABOUTME: Fee quote management — fetches from /fees, caches, auto-refreshes 30s before expiry.
// ABOUTME: Stub: returns null + no-op refresh. Implementation lands with the shield/unshield flows.

import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { feeQuoteAtom, feeQuoteIsStaleAtom } from '@/state/fees'
import type { FeeSchedule } from '@/lib/relayer'

export interface UseFeesResult {
  quote: FeeSchedule | null
  isStale: boolean
  refresh: () => Promise<void>
}

export function useFees(): UseFeesResult {
  const quote = useAtomValue(feeQuoteAtom)
  const isStale = useAtomValue(feeQuoteIsStaleAtom)
  const refresh = useCallback(async () => {
    // TODO: call fetchFees(), persist into feeQuoteAtom.
  }, [])
  return { quote, isStale, refresh }
}
