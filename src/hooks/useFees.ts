// ABOUTME: Fee quote manager — fetches /fees from the relayer, caches in `feeQuoteAtom`, auto-refreshes ~30s before the cached quote's expiry.
// ABOUTME: Multi-instance safe; the in-flight guard prevents duplicate fetches when several modals mount simultaneously. Tracks errors via the telemetry sink.

import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import { feeQuoteAtom, feeQuoteIsStaleAtom } from '@/state/fees'
import { fetchFees, type FeeSchedule } from '@/lib/relayer'
import { trackError } from '@/lib/telemetry'

export interface UseFeesResult {
  quote: FeeSchedule | null
  isStale: boolean
  /**
   * Force a fresh fetch — usually unnecessary; the hook auto-refreshes near expiry. Returns the
   * fresh schedule so callers can submit with the new cacheId directly without waiting for a
   * subsequent re-render to surface the updated atom value.
   */
  refresh: () => Promise<FeeSchedule | null>
}

/** Re-fetch 30s before the relayer's TTL expires so callers never see a stale quote. */
const REFRESH_LEAD_MS = 30_000
/** Cold-start poll cadence when no quote exists yet (relayer might be starting up). */
const COLD_RETRY_MS = 15_000

// Module-scope in-flight guard — `useFees` is called from multiple modals concurrently and we
// don't want N parallel /fees requests. A simple boolean is fine because fetchFees() resolves
// once and clears it before returning.
let inFlight = false

export function useFees(): UseFeesResult {
  const [quote, setQuote] = useAtom(feeQuoteAtom)
  const isStale = useAtomValue(feeQuoteIsStaleAtom)
  const inFlightLocalRef = useRef(false)

  const refresh = useCallback(async (): Promise<FeeSchedule | null> => {
    if (inFlight) return null
    inFlight = true
    inFlightLocalRef.current = true
    try {
      const next = await fetchFees()
      setQuote(next)
      return next
    } catch (err) {
      trackError('useFees.refresh', err, { scope: 'fees', message: 'fetchFees failed' })
      return null
    } finally {
      inFlight = false
      inFlightLocalRef.current = false
    }
  }, [setQuote])

  useEffect(() => {
    // Cold-start fetch — only one of the mounted instances will actually run it (in-flight guard).
    if (!quote) {
      void refresh()
    }
    // Schedule the next refresh based on the cached quote's expiry. The effect re-runs when
    // `quote` changes (after a successful refresh), so the timer always targets the freshest
    // expiresAt. Without a cached quote, we cold-retry every 15s.
    const delay = quote
      ? Math.max(1_000, quote.expiresAt - Date.now() - REFRESH_LEAD_MS)
      : COLD_RETRY_MS
    const timer = window.setTimeout(() => void refresh(), delay)
    return () => window.clearTimeout(timer)
  }, [quote, refresh])

  return { quote, isStale, refresh }
}
