// ABOUTME: useRelayerSubmitBlock — a submit-gate reason for relayer-mediated spend flows when the
// ABOUTME: relayer is unavailable. Spends have no wallet fallback (#23), so Confirm must be disabled.

import { useRelayerHealth } from '@/hooks/useRelayerHealth'

/** Inline reason surfaced above the disabled Confirm on a spend Review step. */
export const RELAYER_UNAVAILABLE_REASON = "Can't reach a relayer right now"
/** Inline reason while the reachability probe is still resolving (shared with the shield gate). */
export const RELAYER_CHECKING_REASON = 'Checking relayer…'

/**
 * Returns the submit-block reason for a relayer-mediated spend (send / unshield / yield) when the
 * relayer can't accept a broadcast right now, else null. Callers fold it into `submitBlockedReason`
 * to disable Confirm. Two blocking states:
 *   - `isChecking` — a probe is in flight; we don't yet know the relayer is reachable, so hold.
 *   - unavailable — not configured, or unreachable after the probe retries.
 * Spends have no direct wallet fallback (that would link the user's EVM address to a shielded spend;
 * #23), so both must block. Recovers live — the moment the relayer is reachable, the gate clears.
 */
export function useRelayerSubmitBlock(isOpen: boolean): string | null {
  const { isConfigured, isUnreachable, isChecking } = useRelayerHealth({ enabled: isOpen })
  if (isChecking) return RELAYER_CHECKING_REASON
  if (!isConfigured || isUnreachable) return RELAYER_UNAVAILABLE_REASON
  return null
}
