// ABOUTME: The dashboard's projected balance (3B) — the SDK's scanned balance plus what in-flight transactions are known to
// ABOUTME: bring (lib/tx/projectedBalance: a send's change, a shield's note), shown at broadcast; and whether that's unconfirmed.

import { atom } from 'jotai'
import { projectedBalance } from '@/lib/tx/projectedBalance'
import { activeTxListAtom } from './tx'
import { heldSpendTxidsAtom, scannedThroughAtom, shieldedUsdcAtom, yieldSharesAtom } from './wallet'

/** What in-flight transactions add to the scanned balance, per token, and whether anything is projected. */
export const balanceProjectionAtom = atom((get) =>
  projectedBalance({
    records: get(activeTxListAtom),
    heldTxids: get(heldSpendTxidsAtom),
    syncedThrough: get(scannedThroughAtom),
  }),
)

/**
 * The dashboard headline's shielded USDC: `shieldedUsdcAtom` plus each held spend's change and each unscanned same-chain
 * shield's note. A held spend's inputs are
 * neither spendable nor pending and its change isn't scanned yet, so the scanned figure alone would dip below what the
 * user will have; with the change added it reads the balance after the send from broadcast, and hands over to the
 * scanned figure in the sync that confirms it. Display-only — Max, guards and the "pending" suffix keep reading
 * `shieldedUsdcAtom` / `shieldedUsdcSpendableAtom`. null until the first sync. Spec G-11.
 */
export const shieldedUsdcHeadlineAtom = atom((get) => {
  const scanned = get(shieldedUsdcAtom)
  return scanned === null ? null : scanned + get(balanceProjectionAtom).usdc
})

/** The dashboard vault position's shares: `yieldSharesAtom` plus a held vault withdrawal's change in shares — same reason. */
export const yieldSharesHeadlineAtom = atom((get) => {
  const scanned = get(yieldSharesAtom)
  return scanned === null ? null : scanned + get(balanceProjectionAtom).shares
})

/** The headline includes an unconfirmed figure — the balance spot says "Confirming…". */
export const balanceConfirmingAtom = atom((get) => get(balanceProjectionAtom).confirming)
