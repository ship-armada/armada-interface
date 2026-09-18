// ABOUTME: useRelayerSubmitBlock — a submit-gate reason for relayer-mediated spend flows when the
// ABOUTME: relayer is unavailable. Spends have no wallet fallback (#23), so Confirm must be disabled.

import { useRelayerHealth } from '@/hooks/useRelayerHealth'

/** Inline reason surfaced above the disabled Confirm on a spend Review step. */
export const RELAYER_UNAVAILABLE_REASON = "Can't reach a relayer right now"

/**
 * Returns the submit-block reason when the relayer is unavailable (not configured, or unreachable
 * after its probe retries), else null. Relayer-mediated spends (send / unshield / yield) can't be
 * broadcast without it and — unlike shield — have no direct wallet fallback (that would link the
 * user's EVM address to a shielded spend; #23), so callers fold this into `submitBlockedReason` to
 * disable Confirm. Deliberately does NOT block during the initial `isChecking` probe: that resolves
 * in well under the clicks it takes to reach Review, and blocking then would disable Confirm on a
 * healthy relayer too. Recovers live — the moment the relayer is reachable again, the gate clears.
 */
export function useRelayerSubmitBlock(isOpen: boolean): string | null {
  const { isConfigured, isUnreachable } = useRelayerHealth({ enabled: isOpen })
  return !isConfigured || isUnreachable ? RELAYER_UNAVAILABLE_REASON : null
}
