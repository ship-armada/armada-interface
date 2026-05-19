// ABOUTME: Railgun wallet hook — exposes the active wallet's state and typed lifecycle actions.
// ABOUTME: Plural-wallet schema (state/wallet.ts) is future-proofing; v1 UX is singular and the hook hides that.

import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'
import {
  activeRailgunWalletIdAtom,
  activeShieldedWalletAtom,
  shieldedWalletsAtom,
} from '@/state/wallet'
import { createWallet, lockWallet, unlockWallet } from '@/lib/railgun/wallet'
import { track, trackError } from '@/lib/telemetry'

export function useShieldedWallet() {
  const active = useAtomValue(activeShieldedWalletAtom)
  const activeId = useAtomValue(activeRailgunWalletIdAtom)
  const setWallets = useSetAtom(shieldedWalletsAtom)
  const setActiveId = useSetAtom(activeRailgunWalletIdAtom)

  const unlock = useCallback(async (id: string, passphrase: string) => {
    try {
      const next = await unlockWallet(id, passphrase)
      setWallets(prev => ({ ...prev, [id]: next }))
      setActiveId(id)
      track('shielded.unlock', { walletId: id })
    } catch (err) {
      trackError('useShieldedWallet.unlock', err, { scope: 'shielded.unlock', message: 'unlock failed' })
      throw err
    }
  }, [setWallets, setActiveId])

  const create = useCallback(async (mnemonic: string, passphrase: string) => {
    try {
      const out = await createWallet(mnemonic, passphrase)
      setWallets(prev => ({
        ...prev,
        [out.id]: {
          id: out.id,
          status: 'unlocked',
          railgunAddress: out.railgunAddress,
          unlockedAt: Date.now(),
        },
      }))
      setActiveId(out.id)
      track('shielded.created', { walletId: out.id })
      return out
    } catch (err) {
      trackError('useShieldedWallet.create', err, { scope: 'shielded.create', message: 'create failed' })
      throw err
    }
  }, [setWallets, setActiveId])

  const lock = useCallback(() => {
    if (!activeId) return
    lockWallet(activeId)
    setWallets(prev => {
      const existing = prev[activeId]
      if (!existing) return prev
      return { ...prev, [activeId]: { ...existing, status: 'locked' } }
    })
    track('shielded.locked', { walletId: activeId })
  }, [activeId, setWallets])

  return { state: active, unlock, create, lock }
}
