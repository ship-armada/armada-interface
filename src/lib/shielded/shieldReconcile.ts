// ABOUTME: A confirmed shield's fee reconcile — the pool's actual protocol fee and the relayer fee paid, read off the SDK's
// ABOUTME: history entry for its hub tx, replacing the review-time figures (shared by the same-chain and cross-chain shield).

import type { HistoryEntry } from '@armada/sdk'
import type { MetaShield } from '@/lib/tx/types'
import { isUnlocked as kmIsUnlocked, getWalletId as kmGetWalletId } from './keyManager'
import { refreshShieldedBalances } from './sync'
import { readSdkHistory } from './sdk-read'

/** The fee fields a shield takes from its hub tx's history entry: the pool's actual protocol fee (clearing an estimate's
 *  marker) and the relayer fee paid (gross). No entry → nothing, and the review-time figures stay. */
export function shieldFeesFromHistory(entry: HistoryEntry | undefined): Partial<MetaShield> {
  if (entry === undefined) return {}
  return {
    ...(entry.shieldFee !== undefined ? { protocolFee: entry.shieldFee, protocolFeeIsEstimate: false } : {}),
    ...(entry.broadcasterFee !== undefined && entry.broadcasterFee > 0n ? { feeAmount: entry.broadcasterFee } : {}),
  }
}

/**
 * Sync (awaited) so the just-landed shield is scanned, then read its fees off the history entry for `hubTxHash` — the hub
 * tx that shielded (for a cross-chain shield, the delivery that minted + shielded). Best-effort: a locked wallet or a
 * failed sync/read returns nothing, keeping the review-time figures, which a later rescan corrects.
 */
export async function recordedShieldFees(hubTxHash: string): Promise<Partial<MetaShield>> {
  if (!kmIsUnlocked()) return {}
  try {
    await refreshShieldedBalances(kmGetWalletId())
    const wanted = hubTxHash.replace(/^0x/, '').toLowerCase()
    const entry = (await readSdkHistory()).find(
      (e) => e.category === 'shield' && e.txid.replace(/^0x/, '').toLowerCase() === wanted,
    )
    return shieldFeesFromHistory(entry)
  } catch {
    return {}
  }
}
