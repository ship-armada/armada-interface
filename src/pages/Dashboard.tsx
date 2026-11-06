// ABOUTME: Dashboard page — the balance spot (one BalanceSpot card: sign-in face → sync face → BalanceCard) + deposit tooltip + recent
// ABOUTME: activity. Presentation from the armada-app mockup; wired to real shielded balance, yield, and tx history.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAccount } from 'wagmi'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { BalanceCard } from '@/components/dashboard/BalanceCard'
import { DepositTooltip } from '@/components/dashboard/DepositTooltip'
import {
  DASHBOARD_TOOLTIP_ENTER_DELAY_MS,
  activityFirstPaint,
  dashboardActivityEnterDelayMs,
} from '@/components/dashboard/BalanceCard/balanceRevealMotion'
import { DashboardScrollTopFade } from '@/components/dashboard/DashboardScrollTopFade'
import { FirstSignInBanner, SignInCard, lockNoteFor, payNoteFor } from '@/components/dashboard/SignInCard'
import { BalanceSpot, type BalanceSpotFace } from '@/components/dashboard/BalanceSpot'
import { preferencesAtom } from '@/state/preferences'
import { RecentActivityList, ActivityAllPanel } from '@/components/dashboard/RecentActivityList'
import { useDepositTooltipHandoff, useEarnBannerHandoff } from '@/hooks/useEarnBannerHandoff'
import { ActivityReceipt } from '@/components/dashboard/ActivityReceipt'
import { buildActivityItems, type DashboardActivityItem } from '@/components/dashboard/txActivityAdapter'
import { selfSendAsMerge } from '@/lib/tx/selfSend'
import { formatUsdcAmount } from '@/components/dashboard/dashboardFormat'
import type { BalanceRollMode } from '@/components/dashboard/RollingBalanceValue'
import { isInitialSyncGated } from '@/components/sync'
import { SyncCard } from '@/components/dashboard/SyncCard'
import { useSyncRetry } from '@/hooks/useSyncRetry'
import { readHistoryCheckpoint } from '@/lib/shielded/history-checkpoint'
import { readStoredWalletId, readStoredWalletIdFor } from '@/lib/shielded/wallet'
import { useYieldRate } from '@/hooks/useYieldRate'
import { useOpenActionModal } from '@/hooks/useOpenActionModal'
import { apyExplanation, formatApyPercent, formatEarnApyHeadline, sharesToUsdc } from '@/lib/yield'
import { accruedVaultYieldRaw } from '@/components/dashboard/vaultEarnings'
import { historyRecoveryAtom } from '@/state/history'
import {
  openModalAtom,
  balanceHiddenAtom,
  activityPanelOpenAtom,
  receiptTxIdAtom,
  repeatIntentAtom,
  lockReasonAtom,
  paymentIntentAtom,
  restoreEntryAtom,
  signInStatusAtom,
} from '@/state/ui'
import { repeatModalFor } from '@/components/dashboard/repeatIntent'
import { useTxInView } from '@/hooks/useTxInView'
import {
  shieldedUsdcAtom,
  shieldedUsdcHeadlineAtom,
  yieldSharesAtom,
  yieldSharesHeadlineAtom,
  shieldedWalletAtom,
  evmAddressAtom,
  activeShieldedWalletIdAtom,
  syncStateAtom,
  syncRetryEpochAtom,
} from '@/state/wallet'
import { activeTxListAtom } from '@/state/tx'
import { requestLinksAtom, requestShareIntentAtom } from '@/state/requestLinks'
import styles from './Dashboard.module.css'

/** USDC is a 6-decimal bigint; the card renders plain numbers. */
function usdcToNumber(amount: bigint): number {
  return Number(amount) / 1e6
}

/** Rows shown in the dashboard's inline activity preview (the "View all" panel shows the rest). */
const ACTIVITY_PREVIEW_MAX = 8
/** Ceiling on the "all activity" panel — rendered without virtualization, so we bound the row count. */
const ACTIVITY_PANEL_MAX = 500

export function Dashboard() {
  // Data (all hooks run unconditionally).
  const shielded = useAtomValue(shieldedUsdcAtom)
  const yieldShares = useAtomValue(yieldSharesAtom)
  // Headline figures also count a broadcast spend's held inputs, so a send / vault withdrawal doesn't
  // dip the numbers before its change note is scanned. Gating stays on the base atoms above.
  const shieldedHeadline = useAtomValue(shieldedUsdcHeadlineAtom)
  const yieldSharesHeadline = useAtomValue(yieldSharesHeadlineAtom)
  const { rate: yieldRate } = useYieldRate()
  const shieldedWallet = useAtomValue(shieldedWalletAtom)
  const txList = useAtomValue(activeTxListAtom)
  // The records as Activity shows them — a send to the wallet's own 0zk reads as a merge (only its fee left); the row
  // and its receipt both read this list, so they agree.
  const activityTxList = useMemo(
    () => txList.map((record) => selfSendAsMerge(record, shieldedWallet.shieldedAddress)),
    [txList, shieldedWallet.shieldedAddress],
  )
  const requestLinks = useAtomValue(requestLinksAtom)
  const evmAddress = useAtomValue(evmAddressAtom)
  // Before sign-in: the sign-in card's inputs — wallet connection and address, the sign-in attempt, why it locked, a waiting pay link.
  const { status: connectionStatus, address: connectedAddress } = useAccount()
  const signInStatus = useAtomValue(signInStatusAtom)
  const setRestoreEntry = useSetAtom(restoreEntryAtom)
  const lockReason = useAtomValue(lockReasonAtom)
  const { autoLockMinutes } = useAtomValue(preferencesAtom)
  const paymentIntent = useAtomValue(paymentIntentAtom)
  // While the first sync runs after sign-in: its progress / failure, and whether a retry was already made.
  const syncState = useAtomValue(syncStateAtom)
  const syncRetried = useAtomValue(syncRetryEpochAtom) > 0
  const retrySync = useSyncRetry()
  const activeWalletId = useAtomValue(activeShieldedWalletIdAtom)

  // Actions
  const openActionModal = useOpenActionModal()
  const openModal = useAtomValue(openModalAtom)
  const setOpenModal = useSetAtom(openModalAtom)
  const setShareIntent = useSetAtom(requestShareIntentAtom)
  const setRepeatIntent = useSetAtom(repeatIntentAtom)

  // "All activity" side-panel + the per-tx receipt overlay (replaces the retired /history page).
  const [activityPanelOpen, setActivityPanelOpen] = useAtom(activityPanelOpenAtom)
  const [receiptId, setReceiptId] = useAtom(receiptTxIdAtom)
  // The open receipt shows its tx (live, while pending), so that tx raises no toast / header notice meanwhile.
  useTxInView(receiptId, receiptId !== null)

  // Click routing: a created-link row re-opens the Request flow at its Share step; every other row
  // opens the per-tx receipt.
  function handleActivityItemClick(item: DashboardActivityItem) {
    if (item.kind === 'requestLink') {
      const link = requestLinks.find((l) => l.requestId === item.requestId)
      if (link) {
        setShareIntent(link)
        setOpenModal('request')
      }
      return
    }
    setReceiptId(item.id)
  }

  // Balance visibility is app-wide (shared with the wallet panel's hide toggle) via balanceHiddenAtom.
  const [balanceHidden, setBalanceHidden] = useAtom(balanceHiddenAtom)

  // Balance odometer roll. The *displayed* balance lags the live atom while a tx modal is open (or
  // while the initial sync is still loading), then advances to the live value together with the roll
  // trigger — so the card holds the OLD number and rolls to the NEW one on return, rather than
  // flashing NEW then rolling. Mirrors the mockup, which defers the whole advance (value + roll)
  // until the user is back on the dashboard.
  const gated = isInitialSyncGated(shielded)
  // The vault position depends on yieldRate, which loads from a separate poll (useYieldRate) — later
  // than the wallet scan the syncing card waits on. Only prime the promo-banner handoffs once BOTH the
  // gate has lifted and the vault data has loaded, so the established balance/vault values form the
  // baseline rather than a late 0 → real arrival that flashes a banner in and out.
  const vaultLoaded = yieldShares !== null && yieldRate !== null
  const [handoffReady, setHandoffReady] = useState(false)
  useEffect(() => {
    if (gated || !vaultLoaded) {
      setHandoffReady(false)
      return
    }
    const id = requestAnimationFrame(() => setHandoffReady(true))
    return () => cancelAnimationFrame(id)
  }, [gated, vaultLoaded])
  // The SDK balance only — the dashboard is gated until it's known (G-11), so the 0 is never shown.
  const liveBalance = usdcToNumber(shieldedHeadline ?? shielded ?? 0n)
  const earningUsdc =
    yieldShares !== null && yieldRate !== null
      ? sharesToUsdc(yieldSharesHeadline ?? yieldShares, yieldRate.rate)
      : 0n
  const liveVault = usdcToNumber(earningUsdc)
  const vaultApy = yieldRate !== null ? Number(yieldRate.apyBps) / 100 : undefined
  // Accrued vault yield = current vault value − net capital contributed (settled yield deposits −
  // withdrawals, from history). Only trustworthy once the vault has loaded, the initial sync has
  // landed, and history recovery has SETTLED (`idle`) — a mid/failed recovery scan would under-count
  // deposits and over-state the gain. Until then leave it undefined so the bar shows its placeholder
  // rather than a wrong-looking number.
  const historyRecovery = useAtomValue(historyRecoveryAtom)
  const vaultEarned =
    vaultLoaded && !gated && historyRecovery.state === 'idle'
      ? usdcToNumber(accruedVaultYieldRaw(txList, earningUsdc))
      : undefined
  // Both the private balance and the vault position are held while a tx modal is open (or the sync
  // gate is up), then advance together with a single roll trigger on return — so the balance roll,
  // the vault-row grow-in, and the earn-banner handoff all play on the dashboard rather than behind
  // the modal. vaultFromValue is set only when the vault actually moved (earn deposit/withdraw).
  // Mirrors the mockup's applyEarnVisibleBalance.
  const [displayedBalance, setDisplayedBalance] = useState(liveBalance)
  const [displayedVault, setDisplayedVault] = useState(liveVault)
  const [rollTrigger, setRollTrigger] = useState(0)
  const [rollMode, setRollMode] = useState<BalanceRollMode>('fromZero')
  const [rollFromValue, setRollFromValue] = useState<string | undefined>(undefined)
  const [vaultRollFromValue, setVaultRollFromValue] = useState<string | undefined>(undefined)
  const lastLiveRef = useRef<number | null>(null)
  const lastVaultRef = useRef<number>(liveVault)
  // Whether the activity list takes the page-load cascade, decided once (activityFirstPaint): yes when it first shows with
  // the balance; no when it was already on screen while syncing, or appears later — those enter immediately.
  const activityVisibleOnPaintRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (gated || openModal !== null) return
    const balanceChanged = lastLiveRef.current !== liveBalance
    const vaultChanged = lastVaultRef.current !== liveVault
    if (!balanceChanged && !vaultChanged) return
    const firstEstablishment = lastLiveRef.current === null
    lastLiveRef.current = liveBalance
    lastVaultRef.current = liveVault
    // First establishment (the initial reveal) doesn't roll — the intro roll-from-zero handles it.
    if (firstEstablishment) {
      setDisplayedBalance(liveBalance)
      setDisplayedVault(liveVault)
      return
    }
    // Roll-from precision must match each row's display so the odometer settles cleanly: the balance
    // card shows full 6 decimals, the vault row shows 2 (VaultPositionBar's formatUsdcAmount default).
    // Passing 6 for the vault made it spin 6 fraction digits then snap-truncate to 2.
    setRollMode('fromValue')
    setRollFromValue(formatUsdcAmount(displayedBalance, 6))
    setVaultRollFromValue(vaultChanged ? formatUsdcAmount(displayedVault, 2) : undefined)
    setRollTrigger((t) => t + 1)
    setDisplayedBalance(liveBalance)
    setDisplayedVault(liveVault)
  }, [gated, openModal, liveBalance, liveVault, displayedBalance, displayedVault])
  // Full activity list (uncapped) so the panel can show everything up to its ceiling and we can tell
  // whether that ceiling was hit. The dashboard preview + the panel then slice their own views.
  const allActivityItems = useMemo(
    () => buildActivityItems(activityTxList, requestLinks, evmAddress, Infinity),
    [activityTxList, requestLinks, evmAddress],
  )
  const previewActivityItems = useMemo(
    () => allActivityItems.slice(0, ACTIVITY_PREVIEW_MAX),
    [allActivityItems],
  )
  const panelActivityItems = useMemo(
    () => allActivityItems.slice(0, ACTIVITY_PANEL_MAX),
    [allActivityItems],
  )
  // Only surface the "showing latest 500" note when activity actually exceeds the ceiling.
  const activityTruncated = allActivityItems.length > ACTIVITY_PANEL_MAX
  const hasCompletedDeposit = txList.some(
    (r) => (r.kind === 'shield' || r.kind === 'shield-xchain') && r.executionState === 'completed',
  )
  const walletConnected = evmAddress !== null
  // Promo-banner handoff: after a first shield the deposit tooltip holds through the balance roll,
  // then collapses and hands off to the earn banner (and reverses on vault deposit/withdraw), rather
  // than the two banners swapping instantly. See useEarnBannerHandoff.
  const depositTooltipHandoff = useDepositTooltipHandoff(
    walletConnected,
    hasCompletedDeposit,
    displayedBalance,
    handoffReady,
  )
  const earnBannerHandoff = useEarnBannerHandoff(
    walletConnected,
    hasCompletedDeposit,
    displayedVault,
    displayedBalance,
    handoffReady,
  )
  const showDepositTooltip = depositTooltipHandoff.showDepositTooltip
  const depositTooltipPersistVisible = depositTooltipHandoff.depositTooltipPersistVisible
  const depositTooltipExiting = depositTooltipHandoff.depositTooltipExiting
  // Activity shows automatically whenever there are items (the manual hide toggle was dropped in the
  // polish redesign — the more-menu that held it is gone).
  const showActivity = allActivityItems.length > 0
  // Earn promo banner — the two banners are mutually exclusive; earn only shows once the deposit
  // tooltip is gone and the vault pays a real APY. Gated on `handoffReady` so it can't flash during
  // load: yieldRate (→ earnApyAvailable) and the deferred `displayedVault` settle on different renders,
  // so before the dashboard is ready there's a frame where apy looks available while the vault still
  // reads 0 — which would briefly show the banner, then collapse it out.
  const earnApyAvailable = vaultApy !== undefined && vaultApy > 0
  const showEarnBanner =
    handoffReady && earnBannerHandoff.showEarnBanner && !showDepositTooltip && earnApyAvailable
  const earnBannerHandoffEnter =
    earnBannerHandoff.earnBannerHandoffEnter || (showEarnBanner && depositTooltipHandoff.revealEarnBanner)
  const earnBannerPersistVisible = earnBannerHandoff.earnBannerPersistVisible

  // Tooltip/earn-banner enter delay — fades up after the balance card's action row settles.
  const tooltipEnterStyle = {
    '--dashboard-tooltip-enter-delay': `${DASHBOARD_TOOLTIP_ENTER_DELAY_MS}ms`,
  } as CSSProperties

  // The "all activity" panel (View all) + the per-tx receipt overlay — replace the old /history page. Shown once signed in
  // (syncing or with the balance).
  const activityOverlays = (
    <>
    {/* Full "all activity" panel (View all) + the per-tx receipt overlay — replace the old /history page. */}
    <ActivityAllPanel
      open={activityPanelOpen}
      onClose={() => setActivityPanelOpen(false)}
      items={panelActivityItems}
      truncatedCount={activityTruncated ? ACTIVITY_PANEL_MAX : undefined}
      balanceRevealed={!balanceHidden}
      onItemClick={handleActivityItemClick}
    />
    <ActivityReceipt
      record={activityTxList.find((record) => record.id === receiptId) ?? null}
      ownWalletAddress={evmAddress ?? undefined}
      open={receiptId !== null}
      onClose={() => setReceiptId(null)}
      // "Send again" / "Shield again" / …: hand the prefill to the flow it repeats, which seeds its amount step. Not
      // offered while the first sync runs — no flow opens until the balance is known.
      onRepeat={
        gated
          ? undefined
          : (intent) => {
              setRepeatIntent(intent)
              openActionModal(repeatModalFor(intent))
            }
      }
    />
    </>
  )

  // The balance spot is one card (BalanceSpot) from sign-in through the first sync to the balance, its face following the
  // wallet. Locked → the sign-in face: no activity (history is encrypted until sign-in) and no banners; it signs in inline
  // (its button connects if needed, then asks for the signature — useOpenActionModal → useSignIn) and restoring opens the
  // restore modal. Signed in with no balance yet (11A) → the sync face: no figure (G-11) and no flows until the balance is
  // known, while activity already shows. Then the balance face, with its intro roll — in the same card.
  const locked = shieldedWallet.status !== 'unlocked'
  const face: BalanceSpotFace = locked ? 'sign-in' : gated ? 'sync' : 'balance'
  const syncFailed = syncState.status === 'failed'
  // The first sign-in for an address on this device double-signs (the determinism check). Before a wallet connects,
  // judge by the device: no wallet stored here at all means the first prompt will be one of two.
  const firstTimeOnDevice =
    locked && (connectedAddress ? readStoredWalletIdFor(connectedAddress) === null : readStoredWalletId() === null)

  // Page-load cascade: activity enters last, after the hero → actions → banner beats — when it first shows with the balance.
  // Activity already on screen while syncing keeps no delay (raising it would replay its entrance); later activity enters at once.
  activityVisibleOnPaintRef.current = activityFirstPaint(activityVisibleOnPaintRef.current, face, showActivity)
  const activityEnterDelayMs = dashboardActivityEnterDelayMs(
    showDepositTooltip || showEarnBanner,
    activityVisibleOnPaintRef.current ?? false,
  )
  const activityEnterStyle = {
    '--dashboard-activity-enter-delay': `${activityEnterDelayMs}ms`,
  } as CSSProperties

  return (
    <div className={styles.page}>
      <DashboardScrollTopFade enabled={!locked && showActivity} />
      <div className={styles.cardStack}>
        <BalanceSpot face={face} showMark={face === 'sign-in' || (face === 'sync' && !syncFailed)}>
          {face === 'sign-in' ? (
            <SignInCard
              connection={
                connectionStatus === 'reconnecting' || connectionStatus === 'connecting'
                  ? 'reconnecting'
                  : connectionStatus === 'connected'
                    ? 'connected'
                    : 'disconnected'
              }
              address={connectedAddress}
              submitting={signInStatus.submitting}
              error={signInStatus.error}
              lockNote={lockNoteFor(lockReason, autoLockMinutes)}
              payNote={payNoteFor(paymentIntent)}
              onSignIn={() => openActionModal()}
              onRestore={() => {
                setRestoreEntry({ view: 'restore' })
                setOpenModal('restore')
              }}
            />
          ) : face === 'sync' ? (
            <SyncCard
              progress={syncState.progress}
              failed={syncFailed}
              retried={syncRetried}
              // No history checkpoint for this wallet here yet = its first sync on this device, scanning from the start.
              firstSync={activeWalletId !== null && readHistoryCheckpoint(activeWalletId) === null}
              onRetry={retrySync}
            />
          ) : (
            <BalanceCard
              balance={displayedBalance}
              balanceRollTrigger={rollTrigger}
              balanceRollMode={rollMode}
              balanceRollFromValue={rollFromValue}
              vaultBalance={displayedVault}
              vaultRollFromValue={vaultRollFromValue}
              vaultApy={vaultApy}
              vaultEarned={vaultEarned}
              armadaAddress={shieldedWallet.shieldedAddress}
              balanceHidden={balanceHidden}
              onBalanceHiddenChange={setBalanceHidden}
              onSend={() => openActionModal('payment')}
              onDeposit={() => openActionModal('shield')}
              onRequest={() => openActionModal('request')}
              onEarn={() => openActionModal('yield-deposit')}
              onVaultOpen={() => openActionModal('yield-deposit')}
            />
          )}
        </BalanceSpot>

        {firstTimeOnDevice ? <FirstSignInBanner /> : null}

        {face === 'balance' && showDepositTooltip ? (
          <div
            className={[
              styles.cardStackTooltip,
              depositTooltipExiting
                ? styles.tooltipHandoffExit
                : depositTooltipPersistVisible
                  ? styles.tooltipVisible
                  : styles.tooltipEnter,
            ].join(' ')}
            style={depositTooltipPersistVisible || depositTooltipExiting ? undefined : tooltipEnterStyle}
          >
            <div className={styles.cardStackTooltipInner}>
              <DepositTooltip stretch onDeposit={() => openActionModal('shield')} />
            </div>
          </div>
        ) : null}

        <EarnBannerSlot
          show={face === 'balance' && showEarnBanner}
          handoffEnter={earnBannerHandoffEnter}
          persistVisible={earnBannerPersistVisible}
          tooltipEnterStyle={tooltipEnterStyle}
        >
          <DepositTooltip
            stretch
            BadgeIcon={ChartBarIcon}
            badgeBackground="white"
            iconTileTone="purple"
            headline={formatEarnApyHeadline(vaultApy ?? 0)}
            body="Add USDC to Armada's shielded vault and start earning now."
            infoTooltip={apyExplanation(yieldRate?.yieldFeeBps)}
            ariaLabel={`Estimated yearly yield ~${formatApyPercent(vaultApy ?? 0)}`}
            onDeposit={() => openActionModal('yield-deposit')}
          />
        </EarnBannerSlot>

        {!locked && showActivity ? (
          <div className={styles.activityEnter} style={activityEnterStyle}>
            <RecentActivityList
              items={previewActivityItems}
              balanceRevealed={!balanceHidden}
              onViewAll={() => setActivityPanelOpen(true)}
              onItemClick={handleActivityItemClick}
            />
          </div>
        ) : null}
      </div>

      {!locked ? activityOverlays : null}
    </div>
  )
}

/**
 * Earn-banner slot. Owns its own mount lifecycle so it can animate out: it stays mounted after
 * `show` goes false to play the collapse-out, then unmounts. When it enters via a handoff (after a
 * first shield / vault deposit) it grows in with the collapse animation; on a plain page load it uses
 * the delayed fade. `handoffSettled` drops the collapse constraint once the grow-in finishes so the
 * banner sits normally.
 */
function EarnBannerSlot({
  show,
  handoffEnter,
  persistVisible,
  tooltipEnterStyle,
  children,
}: {
  show: boolean
  handoffEnter: boolean
  persistVisible: boolean
  tooltipEnterStyle?: CSSProperties
  children: ReactNode
}) {
  const [rendered, setRendered] = useState(show)
  const [exiting, setExiting] = useState(false)
  const [handoffSettled, setHandoffSettled] = useState(!handoffEnter)

  useEffect(() => {
    if (show) {
      setRendered(true)
      setExiting(false)
      return
    }
    if (!rendered) return
    // Hide requested while on screen — collapse out, then unmount (or unmount immediately if the
    // user prefers reduced motion).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRendered(false)
      return
    }
    setExiting(true)
  }, [show, rendered])

  useEffect(() => {
    if (!handoffEnter) {
      setHandoffSettled(true)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHandoffSettled(true)
      return
    }
    setHandoffSettled(false)
  }, [handoffEnter])

  if (!rendered) return null

  const enterClass = exiting
    ? styles.tooltipHandoffExit
    : handoffEnter
      ? styles.tooltipHandoffEnter
      : persistVisible
        ? styles.tooltipVisible
        : styles.tooltipEnter

  return (
    <div
      className={[
        styles.cardStackTooltip,
        enterClass,
        handoffSettled && !exiting ? styles.tooltipHandoffSettled : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={exiting || handoffEnter || persistVisible ? undefined : tooltipEnterStyle}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (exiting) {
          setExiting(false)
          setRendered(false)
          return
        }
        setHandoffSettled(true)
      }}
    >
      <div className={styles.cardStackTooltipInner}>{children}</div>
    </div>
  )
}
