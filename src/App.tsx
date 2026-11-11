// ABOUTME: Top-level route shell — runs the v2 schema migration before anything else, installs the visibility listener, hydrates tx history, starts the executor,
// ABOUTME: then always renders the app (header + Outlet + modals). Locked, the dashboard shows the sign-in card, which signs in inline; RestoreModal handles restores.

import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { AppLayout } from '@/components/AppLayout'
import { RestoreModal } from '@/components/onboarding'
import { ShieldModal } from '@/components/shield'
import { SendModal } from '@/components/payments'
import { MergeModal } from '@/components/consolidate/MergeModal'
import { RequestModal } from '@/components/request'
import { EarnModal } from '@/components/yield'
import { SettingsModal } from '@/components/settings'
import { SingleTabGate } from '@/components/SingleTabGate'
import { useAutoLock } from '@/hooks/useAutoLock'
import { useCloseFlowsOnLock } from '@/hooks/useCloseFlowsOnLock'
import { usePayViaLinkIntent } from '@/hooks/usePayViaLinkIntent'
import { useHistoryRecovery } from '@/hooks/useHistoryRecovery'
import { useIncomingTransferDetector } from '@/hooks/useIncomingTransferDetector'
import { useNowTicker } from '@/hooks/useNowTicker'
import { useShieldedBalanceSync } from '@/hooks/useShieldedBalanceSync'
import { useRestoreSyncedToast } from '@/hooks/useRestoreSyncedToast'
import { useShieldedSyncPoll } from '@/hooks/useShieldedSyncPoll'
import { useShieldedWatch } from '@/hooks/useShieldedWatch'
import { useNullifierCrossCheck } from '@/hooks/useNullifierCrossCheck'
import { useTabVisible } from '@/hooks/useTabVisible'
import { usePrefetchSdk } from '@/hooks/usePrefetchSdk'
import { usePreloadCircuits } from '@/hooks/usePreloadCircuits'
import { useDebugSync } from '@/hooks/useDebugSync'
import { useTxHistory } from '@/hooks/useTxHistory'
import { useTxNotices } from '@/hooks/useTxNotices'
import { usePendingTabTitle } from '@/hooks/usePendingTabTitle'
import { useTxNoticePresenter } from '@/hooks/useTxNoticePresenter'
import { useBalanceLatencyProbe } from '@/hooks/useBalanceLatencyProbe'
import { useSignInBalanceProbe } from '@/hooks/useSignInBalanceProbe'
import { useRequestLinks } from '@/hooks/useRequestLinks'
import { useTxResume } from '@/hooks/useTxResume'
import { useUsdcBalances } from '@/hooks/useUsdcBalances'
import { useWallet } from '@/hooks/useWallet'
// Side-effect imports: register each feature's stage handler with the tx executor at module load.
// Per-feature handlers each have their own side-effect entry point under features/<area>/index.ts.
import '@/features/shield'
import '@/features/shield-xchain'
import '@/features/unshield'
import '@/features/unshield-xchain'
import '@/features/transfer-shielded'
import '@/features/consolidate'
import '@/features/yield-deposit'
import '@/features/yield-withdraw'
import { startEngine } from '@/lib/tx/executor'
import { trackError } from '@/lib/telemetry'
import { runSchemaMigrationIfNeeded } from '@/lib/shielded/schema-migration'
import { readStoredWalletId } from '@/lib/shielded/wallet'
import {
  activeShieldedWalletIdAtom,
  shieldedWalletAtom,
  shieldedWalletsAtom,
} from '@/state/wallet'
import { anotherTabActiveAtom } from '@/state/ui'

export function App() {
  useTabVisible()
  useCloseFlowsOnLock() // the shell stays up while locked — close flows / receipt / panel that need the unlocked wallet
  useDebugSync() // ?debug URL param → persisted debug-mode flag (gates dev-only affordances)
  useNowTicker() // refresh "3m ago" labels on a 60s cadence
  useTxHistory() // hydrate tx history from IDB on cold load
  useRequestLinks() // hydrate created payment-request links (encrypted, per-wallet) for Recent Activity
  useTxResume() // on unlock (leader only), resume watchers for broadcast txs / fail pre-broadcast interruptions (P0-2)
  useHistoryRecovery() // chain-recover synthetic rows on unlock + re-scan epoch (Phase 9.3)
  useIncomingTransferDetector() // re-scan on balance events so received transfers surface live (Phase 9.4)
  useTxNotices() // tx changes the user isn't watching → the notice feed (header pill / toasts)
  usePendingTabTitle() // "(1) Armada App — …" in the tab while a tx is in flight
  useTxNoticePresenter() // the feed → a toast, or the header pill announcing it (Settings → "Show transaction updates")
  useBalanceLatencyProbe() // how long the balance lags a completed tx (Debug → Tx timings; console telemetry)
  useSignInBalanceProbe() // sign-in → first known balance, first sync vs returning (Debug → Tx timings; console telemetry)
  useAutoLock()  // idle-timer-driven lock for the shielded wallet
  usePayViaLinkIntent() // pick up a pending pay-via-link hand-off + open the prefilled Send on unlock
  // Mirror wagmi's connection state into evmAddressAtom for atom-consumers (useShieldedWallet.signIn,
  // SendModal's withdraw-variant recipient pre-fill). Mounted
  // before the onboarding/unlock guard so the atom is correct even before the user reaches /app.
  useWallet()
  // Subscribe to SDK balance-update events + drive initial scan whenever the wallet unlocks;
  // mirrors the active wallet's shielded USDC balance into shieldedUsdcAtom for BalanceHero
  // and the shield/unshield modals.
  useShieldedBalanceSync()
  // After a restore (backup / pasted secret), one "Your balance is up to date" toast once its balance is known.
  useRestoreSyncedToast()
  // Drive periodic wallet.sync() (visibility-gated) so live balance + incoming-transfer updates keep
  // flowing — the SDK-native replacement for the stock engine's continuous scan poller.
  useShieldedSyncPoll()
  // Liveness floor under the adaptive poll — the SDK's wallet.watch() auto-sync loop (immediate-run +
  // error backoff), visibility-gated, coalescing with the poll's sync() so the two never double-scan.
  useShieldedWatch()
  // WI-5: after each shielded scan completes, cross-check the wallet's own unspent notes against
  // the hub PrivacyPool's on-chain nullifier set and block spending if the indexer omitted a spend.
  useNullifierCrossCheck()
  // Poll the connected wallet's hub USDC balance into usdcBalancesAtom so the ShieldModal's
  // MAX is populated and the user can shield without typing an arbitrary number.
  useUsdcBalances()
  // NOTE: the relayer fee schedule is intentionally NOT fetched here. Each fee-consuming flow
  // (`useShieldFlow`, `useUnshieldFlow`, `SendModal`, `EarnModal`) mounts its own `useFees()`, so
  // `/fees` is only hit while such a modal is open — not on the sign-in screen or the idle
  // dashboard. React Query dedups across a flow's consumers.

  const wallet = useAtomValue(shieldedWalletAtom)
  const anotherTabActive = useAtomValue(anotherTabActiveAtom)
  const setShieldedWallets = useSetAtom(shieldedWalletsAtom)
  const setActiveWalletId = useSetAtom(activeShieldedWalletIdAtom)
  // Boot phases before the app renders: the v2 schema migration, then seeding the persisted wallet.
  const [mode, setMode] = useState<'pre-migration' | 'pre-init' | 'app'>('pre-migration')
  // Load the SDK chunk in the background once the app shell is up (13C), so it doesn't compete with the first screen and
  // is usually ready by sign-in.
  usePrefetchSdk(mode === 'app')
  // Download the common ZK circuits once signed in, so a typical spend's proof doesn't wait on them (#144).
  usePreloadCircuits(wallet.status === 'unlocked')

  // v2 schema migration: drops legacy localStorage keys + IndexedDB databases on first run of
  // the v2 schema. Synchronous portion (localStorage) is done by the time the awaited promise
  // resolves; async portion (IDB drops) is awaited before we transition out of `pre-migration`
  // so the SDK read instance (opened lazily on unlock) doesn't race against the legacy DBs being deleted.
  // Idempotent — `runSchemaMigrationIfNeeded` short-circuits when the on-disk version is current,
  // making StrictMode's double-mount safe.
  useEffect(() => {
    if (mode !== 'pre-migration') return
    let cancelled = false
    void runSchemaMigrationIfNeeded()
      .catch((err) => trackError('schema-migration', err))
      .finally(() => {
        if (!cancelled) setMode('pre-init')
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    if (mode === 'pre-migration') return
    // Start the tx execution engine. Idempotent + module-scope, so this runs
    // safely under StrictMode's double-mount and never spawns a second engine.
    startEngine()
  }, [mode])
  // Cold-boot hydration, in one pass so the app never renders before the wallet entry is seeded. Source of truth on cold
  // boot is localStorage — the SDK persists wallet IDB and we persist the walletId on sign-in, but Jotai atoms reset to
  // defaults on every page load.
  //   - `wallet.status === 'unlocked'`: HMR re-mount, atoms already populated → straight to app.
  //   - otherwise: seed the persisted walletId (if any) as a `locked` entry so sign-in has an active wallet to unlock,
  //     then → the app, whose dashboard shows the sign-in card. First-run (no persisted id) also lands there; signing in
  //     first-derives the wallet.
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
    }
    setMode('app')
  }, [mode, wallet.status, setShieldedWallets, setActiveWalletId])

  // A lock (auto-lock, account switch, tab hidden) or Settings → Reset (wallet 'missing') no longer swaps the page: the
  // dashboard shows the sign-in card, every flow signs in first (useOpenActionModal), and useCloseFlowsOnLock closes
  // anything that needed the unlocked wallet.

  // Another tab already holds the shielded scan instance (SDK enforces one per origin) — supersede
  // every mode with the single-tab gate so the user sees a clear message, not a broken shell.
  if (anotherTabActive) {
    return <SingleTabGate />
  }

  if (mode === 'pre-migration' || mode === 'pre-init') {
    // Brief pre-render gap. `pre-migration` waits for the v2 schema-migration to drop legacy
    // localStorage + IDB state (usually under 50ms — synchronous localStorage clear plus a
    // single-tick IDB delete that's a no-op when the DBs are already absent). `pre-init` is
    // the brief window before the cold-boot derivation effect fires. Either state should
    // rarely paint; null avoids flashing the wrong shell.
    return null
  }

  return (
    <>
      <AppLayout>
        <Outlet />
      </AppLayout>
      {/* Feature modals — mounted at App level so opening one doesn't depend on the current route. */}
      {/* Sign-in: first visit and returning alike (signIn() first-derives or re-derives the same identity), opened from
          the dashboard's sign-in card or any flow tapped while locked. Restore (backup / secret) sits behind a link. */}
      <RestoreModal />
      <ShieldModal />
      <SendModal />
      <EarnModal />
      <RequestModal />
      <SettingsModal />
      <MergeModal />
    </>
  )
}
