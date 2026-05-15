// ABOUTME: Cached fee quote from the relayer. UI reads `feeQuoteAtom`; staleness derived from `expiresAt`.
// ABOUTME: useFees() (hooks/) owns refresh + 30s-pre-expiry auto-refetch; this module just exposes the atom.

import { atom } from 'jotai'
import type { FeeSchedule } from '@/lib/relayer'

export const feeQuoteAtom = atom<FeeSchedule | null>(null)

/** Derived: is the cached quote within 5s of expiry (or already expired)? */
export const feeQuoteIsStaleAtom = atom((get) => {
  const q = get(feeQuoteAtom)
  if (!q) return true
  return Date.now() + 5_000 >= q.expiresAt
})
