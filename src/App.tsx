// ABOUTME: Top-level route shell + wallet-status guard — installs the visibility listener once, hydrates tx history, starts the executor, and renders OnboardingFlow / UnlockFlow / Outlet based on local mode.
// ABOUTME: Guard uses a local mode state (not direct atom read) so the onboarding success screen gets to render even after createWallet flips the atom.

import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { AppLayout } from '@/components/AppLayout'
import { OnboardingFlow, UnlockFlow } from '@/components/onboarding'
import { ShieldModal } from '@/components/shield'
import { UnshieldModal } from '@/components/unshield'
import { SendModal } from '@/components/payments'
import { EarnModal } from '@/components/yield'
import { useAutoLock } from '@/hooks/useAutoLock'
import { useRailgunEngineSync } from '@/hooks/useRailgunEngineSync'
import { useShieldedBalanceSync } from '@/hooks/useShieldedBalanceSync'
import { useTabVisible } from '@/hooks/useTabVisible'
import { useTxHistory } from '@/hooks/useTxHistory'
import { useUsdcBalances } from '@/hooks/useUsdcBalances'
import { useWallet } from '@/hooks/useWallet'
// Side-effect imports: register each feature's stage handler with the tx executor at module load.
// Per-feature handlers each have their own side-effect entry point under features/<area>/index.ts.
import '@/features/shield'
import '@/features/unshield'
import { startEngine } from '@/lib/tx/executor'
import { readStoredWalletId } from '@/lib/railgun/wallet'
import {
  activeRailgunWalletIdAtom,
  shieldedWalletAtom,
  shieldedWalletsAtom,
} from '@/state/wallet'

type GuardMode = 'pre-init' | 'onboarding' | 'unlock' | 'app'

export function App() {
  useTabVisible()
  useTxHistory() // hydrate tx history from IDB on cold load
  useAutoLock()  // idle-timer-driven lock for the shielded wallet
  // Mirror wagmi's connection state into evmAddressAtom for atom-consumers (OnboardingFlow's
  // SignEnrollment step, UnshieldModal's recipient pre-fill, useShieldedWallet.enroll). Mounted
  // before the onboarding/unlock guard so the atom is correct even before the user reaches /app.
  useWallet()
  // Mirror lib/railgun/init's engine lifecycle into railgunEngineAtom so the UI can render
  // a "warming up…" indicator. No-op until the first call to initRailgunEngine (currently
  // triggered by enroll/unlock); future commits may pre-warm on app mount.
  useRailgunEngineSync()
  // Subscribe to SDK balance-update events + drive initial scan whenever the wallet unlocks;
  // mirrors the active wallet's shielded USDC balance into shieldedUsdcAtom for BalanceHero
  // and the shield/unshield modals.
  useShieldedBalanceSync()
  // Poll the connected wallet's hub USDC balance into usdcBalancesAtom so the ShieldModal's
  // MAX is populated and the user can shield without typing an arbitrary number.
  useUsdcBalances()

  useEffect(() => {
    // Start the tx execution engine. Idempotent + module-scope, so this runs
    // safely under StrictMode's double-mount and never spawns a second engine.
    startEngine()
  }, [])

  const wallet = useAtomValue(shieldedWalletAtom)
  const setShieldedWallets = useSetAtom(shieldedWalletsAtom)
  const setActiveWalletId = useSetAtom(activeRailgunWalletIdAtom)
  const [mode, setMode] = useState<GuardMode>('pre-init')

  // Cold-boot hydration + initial mode derivation, in one pass to avoid a race between
  // separate effects (the mode effect would otherwise read a stale `wallet.status` before the
  // hydration setState landed). Source of truth on cold boot is localStorage — the Railgun
  // SDK persists wallet IDB and we persist the walletId on enroll, but Jotai atoms reset to
  // defaults on every page load.
  //
  // Three cases:
  //   - `wallet.status === 'unlocked'`: HMR re-mount, atoms already populated → straight to app.
  //   - persisted walletId in localStorage: returning user → seed `locked` entry → UnlockFlow.
  //   - neither: first run → OnboardingFlow.
  useEffect(() => {
    if (mode !== 'pre-init') return
    if (wallet.status === 'unlocked') {
      setMode('app')
      return
    }
    const persistedId = readStoredWalletId()
    if (persistedId) {
      setShieldedWallets(prev =>
        prev[persistedId] ? prev : { ...prev, [persistedId]: { id: persistedId, status: 'locked' } },
      )
      setActiveWalletId(prev => prev ?? persistedId)
      setMode('unlock')
      return
    }
    setMode('onboarding')
  }, [mode, wallet.status, setShieldedWallets, setActiveWalletId])

  // After initial derivation, react to subsequent lock events (auto-lock timer).
  useEffect(() => {
    if (mode === 'app' && wallet.status === 'locked') setMode('unlock')
  }, [mode, wallet.status])

  if (mode === 'pre-init') {
    // Brief pre-render gap — atom hydration is synchronous in Jotai so this
    // usually never paints. Return null to avoid flashing the wrong shell.
    return null
  }

  if (mode === 'onboarding') {
    return <OnboardingFlow onDone={() => setMode('app')} />
  }

  if (mode === 'unlock') {
    return <UnlockFlow onUnlocked={() => setMode('app')} />
  }

  return (
    <>
      <AppLayout>
        <Outlet />
      </AppLayout>
      {/* Feature modals — mounted at App level so opening one doesn't depend on the current route. */}
      <ShieldModal />
      <UnshieldModal />
      <SendModal />
      <EarnModal />
    </>
  )
}
