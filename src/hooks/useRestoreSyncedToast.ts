// ABOUTME: useRestoreSyncedToast — after a restore (backup file / pasted recovery secret), one "Your balance is up to date"
// ABOUTME: toast once that wallet's balance is known (its first sync done). Forgets the restore if the wallet locks first.

import { useEffect } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { activeShieldedWalletAtom, restoredWalletAwaitingBalanceAtom, shieldedUsdcAtom } from '@/state/wallet'

/**
 * Mount once at App root. A restore sets `restoredWalletAwaitingBalanceAtom` (useShieldedWallet); the balance is null
 * until that wallet's first sync completes and it's read (`useShieldedBalanceSync`), so its arrival is the "synced" moment.
 */
export function useRestoreSyncedToast(): void {
  const [restoredId, setRestoredId] = useAtom(restoredWalletAwaitingBalanceAtom)
  const active = useAtomValue(activeShieldedWalletAtom)
  const balance = useAtomValue(shieldedUsdcAtom)

  useEffect(() => {
    if (restoredId === null) return
    // Locked (or switched away) before the balance landed — no toast for a sync the user didn't see finish.
    if (active?.id !== restoredId || active.status !== 'unlocked') {
      setRestoredId(null)
      return
    }
    if (balance === null) return
    toast('Your balance is up to date')
    setRestoredId(null)
  }, [restoredId, active?.id, active?.status, balance, setRestoredId])
}
