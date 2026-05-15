// ABOUTME: Railgun wallet hook — status, unlock, lock, create. Wraps lib/railgun/wallet with Jotai state mirroring.
// ABOUTME: Stub: returns the current atom state and exposes typed actions that throw "not implemented" until wired.

import { useAtom } from 'jotai'
import { useCallback } from 'react'
import { shieldedWalletAtom } from '@/state/wallet'
import { createWallet, lockWallet, unlockWallet } from '@/lib/railgun/wallet'
import { track, trackError } from '@/lib/telemetry'

export function useShieldedWallet() {
  const [state, setState] = useAtom(shieldedWalletAtom)

  const unlock = useCallback(async (passphrase: string) => {
    try {
      const next = await unlockWallet(passphrase)
      setState(next)
      track('shielded.unlock')
    } catch (err) {
      trackError('useShieldedWallet.unlock', err)
      throw err
    }
  }, [setState])

  const create = useCallback(async (passphrase: string) => {
    try {
      const out = await createWallet(passphrase)
      setState({ status: 'unlocked', railgunAddress: out.railgunAddress, unlockedAt: Date.now() })
      track('shielded.created')
      return out
    } catch (err) {
      trackError('useShieldedWallet.create', err)
      throw err
    }
  }, [setState])

  const lock = useCallback(() => {
    lockWallet()
    setState({ status: 'locked' })
    track('shielded.locked')
  }, [setState])

  return { state, unlock, create, lock }
}
