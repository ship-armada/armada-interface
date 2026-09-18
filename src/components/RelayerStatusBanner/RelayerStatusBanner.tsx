// ABOUTME: RelayerStatusBanner — surfaced inside relayer-mediated modals when the relayer is unavailable.
// ABOUTME: Spends are blocked (no wallet-submit — it would deanonymize them); shield can still proceed direct.

import { Loader2 } from 'lucide-react'
import { Button } from '@/design'
import { useRelayerHealth } from '@/hooks/useRelayerHealth'
import styles from './RelayerStatusBanner.module.css'

export interface RelayerStatusBannerProps {
  /** Match the parent modal's open state so the query pauses while closed. */
  isOpen: boolean
  /**
   * True when the CURRENT flow selection is cross-chain (shield-xchain / unshield-xchain). Gates the
   * delivery advisory, which only applies to the CCTP delivery leg — same-chain flows never show it.
   */
  crossChain?: boolean
  /**
   * True for the SHIELD flow: shielding moves the user's own public USDC in, so a relayer outage just
   * falls back to a direct wallet submit (paying ETH gas) — informational, not a block. Spends (the
   * default) have no such fallback — submitting from the wallet would link the EVM address to a
   * shielded spend (#23) — so they're blocked until the relayer is reachable.
   */
  walletFallback?: boolean
  /**
   * Gates the availability messaging (looking / unavailable / direct-fallback). Pass false once the
   * flow is past Review (wallet-sign / progress / confirmation): the path is already committed, so
   * the availability nudge is just noise there. The cross-chain delivery advisory is unaffected —
   * it stays relevant while delivery is in flight. Defaults to true.
   */
  showAvailability?: boolean
}

/**
 * Surfaces relayer-state banners inside relayer-mediated modals. Cases:
 *
 *  1. Relayer unavailable (not configured, or configured but unreachable):
 *     - `walletFallback` (shield) → informational: the deposit will submit from the wallet (ETH gas).
 *     - spends → blocked: this transaction can't be submitted right now.
 *     Offers a "Check again" retry when the relayer is *configured but unreachable* (re-checking a
 *     build with no relayer configured can't help).
 *  2. Cross-chain flow + the indexer is badly behind → an advisory that delivery may be delayed
 *     (informational; independent of the broadcast path).
 *
 * Deliberately does NOT trip on `/health` `status: 'stale'`: that's routine watcher-indexer lag,
 * not a relay-availability signal — `/relay` and `/status` work regardless (see `useRelayerHealth`).
 */
export function RelayerStatusBanner({
  isOpen,
  crossChain = false,
  walletFallback = false,
  showAvailability = true,
}: RelayerStatusBannerProps) {
  const { isUnreachable, isIndexerStalled, isConfigured, isChecking, refetch } =
    useRelayerHealth({ enabled: isOpen })

  // Resolving — a probe is in flight with no conclusive result yet (initial open, or a "Check
  // again" refetch after an outage). Shown BEFORE the unavailable branch so the banner never blanks
  // mid-check (which reads as "resolved") — see useRelayerHealth.isChecking. No retry button: a
  // check is already running.
  if (showAvailability && isChecking) {
    return (
      <div className={styles.root} role="status" aria-live="polite">
        <div className={styles.checking}>
          <Loader2 className={`${styles.spinner} animate-spin`} size={16} aria-hidden="true" />
          <span className={styles.message}>Looking for an available relayer…</span>
        </div>
      </div>
    )
  }

  // Broadcast-path unavailability — no relayer configured, or configured but currently unreachable.
  if (showAvailability && (!isConfigured || isUnreachable)) {
    const message = walletFallback
      ? isConfigured
        ? "Couldn't find an available relayer. If you choose to proceed, your deposit will be submitted from your own wallet and you'll pay network fees in ETH instead."
        : "No relayer configured. If you choose to proceed, your deposit will be submitted from your own wallet and you'll pay network fees in ETH instead."
      : isConfigured
        ? "Couldn't find an available relayer, so this transaction can't be submitted right now — please try again in a moment."
        : "No relayer configured, so this transaction can't be submitted right now."
    return (
      <div className={styles.root} role="status" aria-live="polite">
        <div className={styles.message}>{message}</div>
        {/* Re-checking only helps when a relayer IS configured but momentarily unreachable. */}
        {isConfigured ? (
          <Button
            variant="secondary"
            size="sm"
            label="Check again"
            showIcon={false}
            className={styles.action}
            onClick={() => void refetch()}
          />
        ) : null}
      </div>
    )
  }

  // Cross-chain delivery advisory — the indexer that feeds CCTP delivery discovery is badly behind.
  // Delivery still completes (a direct-RPC fallback engages) but may lag. Informational only.
  if (crossChain && isIndexerStalled) {
    return (
      <div className={styles.root} role="status" aria-live="polite">
        <div className={styles.message}>
          Cross-chain delivery may be delayed while the network catches up.
        </div>
      </div>
    )
  }

  return null
}
