// ABOUTME: Private-USDC balance card — address + animated balance + Shield/Send/Request/Earn action row + optional vault position bar.
// ABOUTME: While the first scan runs, the figure slot shows the loader (or the failure) instead of a separate sync card.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ChartBarIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { ExternalLink } from 'lucide-react'
import { Button, Tooltip } from '@/design'
import { SUPPORT_URL } from '@/config/support'
import { BalanceActionButton } from '@/components/dashboard/BalanceActionButton'
import {
  RollingBalanceValue,
  rollSettleMs,
  type BalanceRollMode,
} from '@/components/dashboard/RollingBalanceValue'
import { BalanceScrambleValue } from '@/components/dashboard/BalanceScrambleValue'
import {
  BALANCE_REVEAL_DELAY_MS,
  BALANCE_REVEAL_DURATION_MS,
  vaultPositionExitDurationMs,
} from './balanceRevealMotion'
import { VaultPositionBar } from '@/components/dashboard/VaultPositionBar'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { formatUsdcAmount, truncateArmadaAddress } from '@/components/dashboard/dashboardFormat'
import styles from './BalanceCard.module.css'

export type BalanceCardActionLayout = 'default' | 'v2'

export interface BalanceCardProps {
  balance: number
  balanceRollTrigger?: number
  balanceRollMode?: BalanceRollMode
  balanceRollFromValue?: string
  /** When true, show hide/show activity in the ellipses menu. */
  hasActivityItems?: boolean
  /** Kept for callers; action row is the same on both dashboard versions. */
  actionLayout?: BalanceCardActionLayout
  onSend?: () => void
  onDeposit?: () => void
  onRequest?: () => void
  onMore?: () => void
  onEarn?: () => void
  onWithdraw?: () => void
  vaultBalance?: number
  vaultApy?: number
  /** Accrued vault yield (USDC) for the green "earned" figure; undefined → the bar shows its placeholder. */
  vaultEarned?: number
  vaultRollFromValue?: string
  onVaultOpen?: () => void
  activityVisible?: boolean
  onToggleActivity?: () => void
  balanceHidden?: boolean
  onBalanceHiddenChange?: (hidden: boolean) => void
  /** User's shielded Armada address — shown above the balance label when set. */
  armadaAddress?: string
  /** The balance includes a figure the chain hasn't confirmed yet (a send's change, an incoming shield — 3B): "Confirming…"
   *  beside the label until it has. */
  confirming?: boolean
  /** The first scan is still running: the figure slot shows the loader instead of an amount. */
  syncing?: boolean
  /** The first scan failed: the figure slot shows the retry, in the same card. */
  syncFailed?: boolean
  /** A retry already failed once, so the help link is shown. */
  syncRetried?: boolean
  onSyncRetry?: () => void
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const BALANCE_BASE_FONT_SIZE_PX = 44
const BALANCE_MIN_FONT_SIZE_PX = 24

function fitBalanceFontSize(rowWidth: number, naturalTextWidth: number): number {
  const maxTextWidth = Math.max(0, rowWidth)
  if (maxTextWidth === 0 || naturalTextWidth <= maxTextWidth) {
    return BALANCE_BASE_FONT_SIZE_PX
  }

  const scaled = (BALANCE_BASE_FONT_SIZE_PX * maxTextWidth) / naturalTextWidth
  return Math.max(BALANCE_MIN_FONT_SIZE_PX, scaled)
}

export function BalanceCard({
  balance,
  balanceRollTrigger = 0,
  balanceRollMode = 'fromZero',
  balanceRollFromValue,
  onSend,
  onDeposit,
  onRequest,
  onEarn,
  vaultBalance = 0,
  vaultApy,
  vaultEarned,
  vaultRollFromValue,
  onVaultOpen,
  balanceHidden: balanceHiddenProp,
  onBalanceHiddenChange,
  armadaAddress,
  confirming = false,
  syncing = false,
  syncFailed = false,
  syncRetried = false,
  onSyncRetry,
}: BalanceCardProps) {
  const isMobileLayout = useMobileLayout()
  const [internalBalanceHidden, setInternalBalanceHidden] = useState(false)
  const balanceHiddenControlled = balanceHiddenProp !== undefined
  const balanceHidden = balanceHiddenControlled ? balanceHiddenProp : internalBalanceHidden
  const setBalanceHidden = (next: boolean | ((hidden: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(balanceHidden) : next
    onBalanceHiddenChange?.(resolved)
    if (!balanceHiddenControlled) {
      setInternalBalanceHidden(resolved)
    }
  }
  const [peekBalance, setPeekBalance] = useState(false)
  const [balanceIntroPlaying, setBalanceIntroPlaying] = useState(false)
  const [balanceIntroArmed, setBalanceIntroArmed] = useState(false)
  const [syncSeen, setSyncSeen] = useState(false)
  const balanceRowRef = useRef<HTMLDivElement>(null)
  const balanceValueRef = useRef<HTMLSpanElement>(null)
  const balanceValueSizerRef = useRef<HTMLSpanElement>(null)
  const [balanceFontSize, setBalanceFontSize] = useState(BALANCE_BASE_FONT_SIZE_PX)
  const [lockedWidth, setLockedWidth] = useState<number | null>(null)
  const [completedRollTrigger, setCompletedRollTrigger] = useState(0)
  const [armadaAddressCopied, setArmadaAddressCopied] = useState(false)
  const armadaAddressCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSync = syncing || syncFailed
  const [prevShowSync, setPrevShowSync] = useState(showSync)
  const [balanceArriving, setBalanceArriving] = useState(false)
  if (showSync && !syncSeen) setSyncSeen(true)
  if (showSync !== prevShowSync) {
    setPrevShowSync(showSync)
    if (showSync) setBalanceArriving(false)
    else if (!prefersReducedMotion()) setBalanceArriving(true)
  }
  // The first scan's balance arrives a render after the gate lifts, still 0 on the frame syncing ends.
  // Wait for that amount before deciding the intro roll; a card that never scanned decides immediately.
  if (!showSync && !balanceIntroArmed) {
    if (balance > 0 && !prefersReducedMotion()) {
      setBalanceIntroArmed(true)
      setBalanceIntroPlaying(true)
    } else if (!syncSeen) {
      setBalanceIntroArmed(true)
    }
  }

  useEffect(() => {
    return () => {
      if (armadaAddressCopyTimerRef.current) clearTimeout(armadaAddressCopyTimerRef.current)
    }
  }, [])

  async function copyArmadaAddress() {
    if (!armadaAddress) return
    try {
      await navigator.clipboard.writeText(armadaAddress)
      setArmadaAddressCopied(true)
      if (armadaAddressCopyTimerRef.current) clearTimeout(armadaAddressCopyTimerRef.current)
      armadaAddressCopyTimerRef.current = setTimeout(() => setArmadaAddressCopied(false), 2000)
    } catch {
      setArmadaAddressCopied(false)
    }
  }

  useEffect(() => {
    if (!balanceIntroPlaying) return
    const timer = window.setTimeout(
      () => setBalanceIntroPlaying(false),
      BALANCE_REVEAL_DELAY_MS + BALANCE_REVEAL_DURATION_MS + 50,
    )
    return () => window.clearTimeout(timer)
  }, [balanceIntroPlaying])

  // Show full USDC precision (up to 6 decimals, trailing zeros trimmed) rather than the mockup's
  // 2-decimal truncation — a shielded balance should never look rounded.
  const formattedBalance = formatUsdcAmount(balance, 6)

  // One timer ends both re-rolls (balance + vault row), so it waits for whichever settles last. Each
  // settle time counts the odometer's alignment padding — a roll from a longer value runs longer than
  // the new value's own digits suggest. Either odometer may be off screen (hidden / zero balance), so
  // this is a computed timer rather than waiting on each odometer's `onRollEnd`.
  useEffect(() => {
    if (balanceRollTrigger <= completedRollTrigger) return

    const balanceSettleMs = rollSettleMs(formattedBalance, {
      mode: balanceRollMode,
      fromValue: balanceRollFromValue,
    })
    // VaultPositionBar shows the vault at its default 2-decimal precision.
    const vaultSettleMs =
      vaultRollFromValue !== undefined
        ? rollSettleMs(formatUsdcAmount(vaultBalance), { mode: 'fromValue', fromValue: vaultRollFromValue })
        : 0
    const timer = window.setTimeout(
      () => setCompletedRollTrigger(balanceRollTrigger),
      Math.max(balanceSettleMs, vaultSettleMs),
    )
    return () => window.clearTimeout(timer)
  }, [
    balanceRollTrigger,
    completedRollTrigger,
    formattedBalance,
    balanceRollMode,
    balanceRollFromValue,
    vaultBalance,
    vaultRollFromValue,
  ])

  useLayoutEffect(() => {
    if (balanceIntroPlaying) return
    const width = balanceValueSizerRef.current?.scrollWidth
    if (!width) return
    setLockedWidth(width)
  }, [balanceIntroPlaying, formattedBalance, balanceFontSize])

  useLayoutEffect(() => {
    if (balanceIntroPlaying) {
      setBalanceFontSize(BALANCE_BASE_FONT_SIZE_PX)
      return
    }

    const row = balanceRowRef.current
    const balanceValue = balanceValueRef.current
    const sizer = balanceValueSizerRef.current
    if (!row || !balanceValue || !sizer) return

    const updateFit = () => {
      balanceValue.style.setProperty('font-size', `${BALANCE_BASE_FONT_SIZE_PX}px`)
      balanceValue.style.setProperty('line-height', `${BALANCE_BASE_FONT_SIZE_PX}px`)
      const naturalWidth = sizer.scrollWidth
      balanceValue.style.removeProperty('font-size')
      balanceValue.style.removeProperty('line-height')
      setBalanceFontSize(fitBalanceFontSize(row.clientWidth, naturalWidth))
    }

    updateFit()

    const observer = new ResizeObserver(updateFit)
    observer.observe(row)
    return () => observer.disconnect()
  }, [formattedBalance, balanceIntroPlaying])

  const showBalance = !balanceHidden || peekBalance
  const depositRollActive =
    !balanceIntroPlaying &&
    showBalance &&
    !balanceHidden &&
    balance > 0 &&
    balanceRollTrigger > completedRollTrigger
  const vaultTransferRollActive =
    !balanceIntroPlaying &&
    vaultRollFromValue !== undefined &&
    balanceRollTrigger > completedRollTrigger
  const showRollingBalance = balanceIntroPlaying || depositRollActive
  const lockBalanceWidth = showRollingBalance || vaultTransferRollActive

  function revealBalancePeek() {
    if (balanceHidden) setPeekBalance(true)
  }

  function hideBalancePeek() {
    setPeekBalance(false)
  }

  const balancePeekHandlers = isMobileLayout
    ? {
        onPointerDown: revealBalancePeek,
        onPointerUp: hideBalancePeek,
        onPointerCancel: hideBalancePeek,
      }
    : {
        onMouseEnter: revealBalancePeek,
        onMouseLeave: hideBalancePeek,
      }

  const balanceClusterLayers = (
    <span
      ref={balanceValueRef}
      className={styles.balanceValue}
      style={
        {
          '--balance-font-size': `${balanceFontSize}px`,
          ...(balanceIntroPlaying
            ? undefined
            : lockBalanceWidth
              ? { width: lockedWidth ?? 'max-content' }
              : undefined),
        } as React.CSSProperties
      }
      aria-label={showBalance ? formattedBalance : 'Balance hidden'}
    >
      <span ref={balanceValueSizerRef} className={styles.balanceValueSizer} aria-hidden>
        {formattedBalance}
      </span>
      <span className={[styles.balanceValueLayer, styles.balanceValueLayerVisible].join(' ')}>
        {showRollingBalance ? (
          <RollingBalanceValue
            value={formattedBalance}
            enableRoll={balanceIntroPlaying ? balance > 0 : depositRollActive}
            mode={balanceRollMode}
            fromValue={balanceRollFromValue}
            rollTrigger={balanceRollTrigger}
          />
        ) : (
          <BalanceScrambleValue value={formattedBalance} revealed={showBalance} />
        )}
      </span>
    </span>
  )

  // Vault row enter/exit state machine. `sync` enter = mid-session appearance (vault deposit, in
  // step with the balance roll); the plain enter = first page-load reveal; exit = collapse-out when
  // the vault is fully withdrawn (kept mounted through the exit animation so it can shrink).
  const lastPositiveVaultRef = useRef(vaultBalance > 0 ? vaultBalance : 0)
  if (vaultBalance > 0) lastPositiveVaultRef.current = vaultBalance

  const showVaultPosition = vaultBalance > 0 || vaultTransferRollActive
  const vaultBarWasRevealed = useRef(vaultBalance > 0)
  const [vaultExiting, setVaultExiting] = useState(false)
  const vaultMounted = showVaultPosition || vaultExiting
  const vaultEnterSync =
    showVaultPosition && !vaultExiting && !vaultBarWasRevealed.current && vaultTransferRollActive
  const shouldAnimateVaultEnter =
    showVaultPosition && !vaultExiting && !vaultBarWasRevealed.current && !vaultTransferRollActive

  if (showVaultPosition) {
    vaultBarWasRevealed.current = true
  }

  useEffect(() => {
    if (showVaultPosition) {
      setVaultExiting(false)
      return
    }
    if (lastPositiveVaultRef.current <= 0) {
      vaultBarWasRevealed.current = false
      return
    }
    vaultBarWasRevealed.current = false
    setVaultExiting(true)
    const timer = window.setTimeout(() => {
      setVaultExiting(false)
      lastPositiveVaultRef.current = 0
    }, vaultPositionExitDurationMs())
    return () => window.clearTimeout(timer)
  }, [showVaultPosition])

  return (
    <div className={styles.cardShell}>
      <div className={styles.card}>
        <button
          type="button"
          className={styles.visibilityToggle}
          aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
          aria-pressed={balanceHidden}
          onClick={() => {
            setBalanceHidden((hidden) => !hidden)
            setPeekBalance(false)
          }}
        >
          {balanceHidden ? (
            <EyeSlashIcon className={styles.badgeIcon} strokeWidth={1.5} aria-hidden />
          ) : (
            <EyeIcon className={styles.badgeIcon} strokeWidth={1.5} aria-hidden />
          )}
        </button>

        <div className={styles.contentArea}>
          <div className={styles.headerBlock}>
            <div className={styles.headingStack}>
              {armadaAddress ? (
                <Tooltip variant="centered" content="This is your private address.">
                  <button
                    type="button"
                    className={[
                      'armada-text-ui-label-md',
                      styles.armadaAddress,
                      armadaAddressCopied && styles.armadaAddressCopied,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => void copyArmadaAddress()}
                    aria-label={
                      armadaAddressCopied
                        ? 'Address copied'
                        : `Copy Armada address ${truncateArmadaAddress(armadaAddress)}`
                    }
                  >
                    {armadaAddressCopied ? 'Copied' : truncateArmadaAddress(armadaAddress)}
                  </button>
                </Tooltip>
              ) : null}
              <div
                className={[styles.balanceStack, balanceArriving && styles.balanceStackEnter]
                  .filter(Boolean)
                  .join(' ')}
              >
                {showSync ? (
                  <BalanceSyncSlot failed={syncFailed} retried={syncRetried} onRetry={onSyncRetry} />
                ) : (
                  <>
                <span className={`armada-text-ui-label-md ${styles.label}`}>
                  USDC shielded balance
                  <span className={styles.confirming} role="status" aria-live="polite">
                    {confirming ? ' · Confirming…' : ''}
                  </span>
                </span>
                <div className={styles.balanceRow} ref={balanceRowRef}>
                  {balanceIntroPlaying ? (
                    <div
                      className={[styles.balanceCluster, styles.balanceClusterIntro].join(' ')}
                      {...balancePeekHandlers}
                    >
                      {balanceClusterLayers}
                    </div>
                  ) : (
                    <div
                      className={[
                        styles.balanceCluster,
                        styles.balanceClusterStable,
                        balanceHidden && styles.balanceClusterPrivate,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      {...balancePeekHandlers}
                    >
                      {balanceClusterLayers}
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={styles.actionRow}>
            <div className={styles.actionEnter}>
              <BalanceActionButton
                variant="primary"
                label="Shield"
                icon={<PlusIcon strokeWidth={1.5} />}
                onClick={onDeposit}
                testingClickId="deposit_button"
              />
            </div>
            <div className={styles.actionEnter}>
              <BalanceActionButton
                label="Send"
                icon={<ArrowRightIcon strokeWidth={1.5} />}
                onClick={onSend}
                testingClickId="send_button"
              />
            </div>
            <div className={styles.actionEnter}>
              <BalanceActionButton
                label="Request"
                icon={<ArrowDownIcon strokeWidth={1.5} />}
                onClick={onRequest}
                testingClickId="request_button"
              />
            </div>
            <div className={styles.actionEnter}>
              <BalanceActionButton
                label="Earn"
                icon={<ChartBarIcon strokeWidth={1.5} />}
                onClick={onEarn}
                testingClickId="vault_open_button"
              />
            </div>
          </div>
        </div>

        {vaultMounted ? (
          <div
            className={[
              styles.vaultPositionWrap,
              vaultExiting
                ? styles.vaultPositionExit
                : vaultEnterSync
                  ? styles.vaultPositionEnterSync
                  : shouldAnimateVaultEnter
                    ? styles.vaultPositionEnter
                    : styles.vaultPositionVisible,
            ].join(' ')}
          >
            <div className={styles.vaultPositionInner}>
              <VaultPositionBar
                balance={vaultBalance}
                apy={vaultApy}
                earnedAmount={vaultEarned}
                vaultRollActive={vaultTransferRollActive && !vaultExiting}
                vaultRollFromValue={vaultRollFromValue}
                vaultRollTrigger={balanceRollTrigger}
                keepMounted={vaultExiting}
                balanceHidden={balanceHidden}
                onOpen={onVaultOpen ?? onEarn}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const SYNC_TICK_COUNT = 24

function BalanceSyncSlot({
  failed,
  retried,
  onRetry,
}: {
  failed: boolean
  retried: boolean
  onRetry?: () => void
}) {
  const ticks = useMemo(() => Array.from({ length: SYNC_TICK_COUNT }, (_, index) => index), [])

  if (failed) {
    return (
      <div className={styles.syncFail} role="alert">
        <p className={`armada-text-ui-body-lg ${styles.syncFailTitle}`}>Sync interrupted</p>
        <p className={`armada-text-ui-body-sm ${styles.syncFailBody}`}>
          Your funds are safe on chain — we just couldn’t finish loading your private balance here. This is usually a
          temporary network problem.
        </p>
        <Button variant="primary" size="md" label="Try again" showIcon={false} onClick={onRetry} />
        {retried ? (
          <div className={styles.syncHelp}>
            <p className={`armada-text-ui-body-sm ${styles.syncFailBody}`}>
              Still not loading? Check your connection, or try again in a few minutes.
            </p>
            <a className={styles.syncHelpLink} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              Get help on Discord
              <ExternalLink size={14} aria-hidden />
            </a>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <span className={`armada-text-ui-label-md ${styles.label} ${styles.syncLabel}`} role="status" aria-live="polite">
        Loading private balance
      </span>
      <div className={styles.syncLoader} aria-hidden="true">
        <span className={styles.syncRing}>
          {ticks.map((index) => (
            <span key={index} className={styles.syncTick} style={{ '--i': index } as CSSProperties} />
          ))}
        </span>
      </div>
    </>
  )
}
