// ABOUTME: RelayerStatusBanner — surfaced inside relayer-mediated modals when /health reports stale/unhealthy.
// ABOUTME: Offers a one-click "Submit from your wallet instead" path that toggles the persisted preference.

import { useAtom } from 'jotai'
import { Button } from '@/design'
import { preferencesAtom } from '@/state/preferences'
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
}

/**
 * Surfaces relayer-state banners inside relayer-mediated modals. Three cases:
 *
 *  1. No relayer configured for this build (P0-10) → steer to wallet-submit.
 *  2. Relayer unreachable → "can't broadcast" nudge to wallet-submit.
 *  3. Cross-chain flow + the indexer is badly behind → an advisory that delivery may be delayed
 *     (informational; NOT a broadcast block, and wallet-submit wouldn't help — the CCTP delivery
 *     leg is relayer-driven either way).
 *
 * Cases 1–2 are broadcast-path nudges, so they're suppressed once the user has opted into
 * wallet-submit (`preferencesAtom.submitFromWallet`, `atomWithStorage` → persisted). Case 3 shows
 * regardless. The banner does NOT decide the submit path — it nudges; handlers read the pref at
 * submit-time.
 *
 * Deliberately does NOT trip on `/health` `status: 'stale'`: that's routine watcher-indexer lag,
 * not a relay-availability signal — `/relay` and `/status` work regardless (see `useRelayerHealth`).
 */
export function RelayerStatusBanner({ isOpen, crossChain = false }: RelayerStatusBannerProps) {
  const { isUnreachable, isIndexerStalled, isConfigured } = useRelayerHealth({ enabled: isOpen })
  const [prefs, setPrefs] = useAtom(preferencesAtom)

  // Broadcast-path nudges (not-configured / unreachable) steer to wallet-submit, so they're moot
  // once the user has already opted in.
  if (!prefs.submitFromWallet) {
    if (!isConfigured) {
      return (
        <div className={styles.root} role="status" aria-live="polite">
          <div className={styles.message}>
            No relayer is configured for this site. You can still submit transactions from your own
            wallet (you'll pay network gas).
          </div>
          <Button
            variant="secondary"
            size="sm"
            label="Submit from my wallet"
            showIcon={false}
            className={styles.action}
            onClick={() => setPrefs({ ...prefs, submitFromWallet: true })}
          />
        </div>
      )
    }

    if (isUnreachable) {
      return (
        <div className={styles.root} role="status" aria-live="polite">
          <div className={styles.message}>
            Can't find an available relayer. Your transaction may not be broadcast promptly.
          </div>
          <Button
            variant="secondary"
            size="sm"
            label="Submit from my wallet instead"
            showIcon={false}
            className={styles.action}
            onClick={() => setPrefs({ ...prefs, submitFromWallet: true })}
          />
        </div>
      )
    }
  }

  // Cross-chain delivery advisory — the indexer that feeds CCTP delivery discovery is badly behind.
  // Delivery still completes (a direct-RPC fallback engages) but may lag. Informational only — no
  // wallet-override CTA, since wallet-submit doesn't change the relayer-driven delivery leg. Shown
  // even under wallet-submit because it's independent of the broadcast path.
  if (crossChain && isIndexerStalled && !isUnreachable) {
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
