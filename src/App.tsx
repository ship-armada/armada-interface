// ABOUTME: Top-level route shell + wallet-status guard — installs the visibility listener once, hydrates tx history, starts the executor, and renders OnboardingFlow / UnlockFlow / Outlet based on local mode.
// ABOUTME: Guard uses a local mode state (not direct atom read) so the onboarding success screen gets to render even after createWallet flips the atom.

import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { AppLayout } from '@/components/AppLayout'
import { OnboardingFlow, UnlockFlow } from '@/components/onboarding'
import { ShieldModal } from '@/components/shield'
import { UnshieldModal } from '@/components/unshield'
import { SendModal } from '@/components/payments'
import { useTabVisible } from '@/hooks/useTabVisible'
import { useTxHistory } from '@/hooks/useTxHistory'
import { startEngine } from '@/lib/tx/executor'
import { shieldedWalletAtom, activeRailgunWalletIdAtom } from '@/state/wallet'

type GuardMode = 'pre-init' | 'onboarding' | 'unlock' | 'app'

export function App() {
  useTabVisible()
  useTxHistory() // hydrate tx history from IDB on cold load

  useEffect(() => {
    // Start the tx execution engine. Idempotent + module-scope, so this runs
    // safely under StrictMode's double-mount and never spawns a second engine.
    startEngine()
  }, [])

  const wallet = useAtomValue(shieldedWalletAtom)
  const activeId = useAtomValue(activeRailgunWalletIdAtom)
  const [mode, setMode] = useState<GuardMode>('pre-init')

  // Initial mode derivation runs once after the atom hydrates. After that, the
  // guard is owned by setMode() so onboarding/unlock flows can keep their screens
  // visible across atom updates.
  useEffect(() => {
    if (mode !== 'pre-init') return
    if (wallet.status === 'missing') setMode('onboarding')
    else if (wallet.status === 'locked') setMode('unlock')
    else setMode('app')
  }, [mode, wallet.status])

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
    return activeId ? (
      <UnlockFlow walletId={activeId} onUnlocked={() => setMode('app')} />
    ) : null
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
    </>
  )
}
