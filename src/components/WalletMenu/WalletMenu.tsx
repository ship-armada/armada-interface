// ABOUTME: Connected-wallet control — a pill trigger (provider icon + address) that opens a right-edge SidePanel with the EVM wallet identity, labeled actions (hide/copy/explorer/disconnect), USDC balance, and a Shield CTA.
// ABOUTME: Matches the mockup's polished wallet panel; the pill fades out as the panel opens and back in as it closes. Balance-hide is shared app-wide via balanceHiddenAtom (owned by the parent).

import { useEffect, useRef, useState } from 'react'
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  PowerIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import TokenUSDC from '@web3icons/react/icons/tokens/TokenUSDC'
import { IconButton, SidePanel, SIDE_PANEL_EXIT_MS } from '@/design'
import { WalletProviderIcon } from '@/components/ui/WalletProviderIcon'
import { chainIconForChainId } from '@/components/ui/chainIcons'
import { BalanceActionButton } from '@/components/dashboard/BalanceActionButton'
import { SendButton } from '@/components/dashboard/SendButton'
import { BalanceScrambleValue } from '@/components/dashboard/BalanceScrambleValue'
import { formatUsdcAmount } from '@/components/dashboard/dashboardFormat'
import styles from './WalletMenu.module.css'

const HERO_ICON_PX = 56
const USDC_GLYPH_PX = 40
const USDC_GLYPH_SIZE = Math.round((USDC_GLYPH_PX * 24) / 18)
// Per-chain breakdown rows are compact + chain-forward: the chain logo is the main glyph, USDC a
// small inset badge — the inverse of the USDC-forward Total row above them.
const CHAIN_GLYPH_PX = 28
const CHAIN_USDC_INSET_SIZE = Math.round((14 * 24) / 18)

/** Pill fade duration — the pill fades out before the panel opens (and back in after it closes). */
const PILL_FADE_MS = 180

function fadeDelayMs(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return PILL_FADE_MS
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PILL_FADE_MS
}

/** One row of the per-chain USDC breakdown shown in the wallet panel. */
export interface WalletChainBalance {
  chainId: number
  /** Human chain name (e.g. "Base Sepolia") — the row subtitle + a11y label. */
  networkLabel: string
  /** Plain USDC balance on that chain (already scaled from raw). */
  usdcBalance: number
}

/**
 * Build the wallet panel's per-chain USDC breakdown: one row per chain that holds USDC, sorted by
 * balance descending. A shield is per-chain, so showing a single combined total is misleading (#8) —
 * this surfaces WHERE the shieldable balance actually sits. Falls back to a single zero row for the
 * connected chain when the wallet holds no USDC anywhere, so the panel never renders empty.
 */
export function buildWalletChainBalances(
  unshielded: Record<number, bigint>,
  connectedChainId: number,
  nameOf: (chainId: number) => string,
): WalletChainBalance[] {
  const rows = Object.entries(unshielded)
    .map(([id, raw]) => ({
      chainId: Number(id),
      networkLabel: nameOf(Number(id)),
      usdcBalance: Number(raw) / 1e6,
    }))
    .filter((r) => r.usdcBalance > 0)
    .sort((a, b) => b.usdcBalance - a.usdcBalance)
  return rows.length > 0
    ? rows
    : [{ chainId: connectedChainId, networkLabel: nameOf(connectedChainId), usdcBalance: 0 }]
}

export interface WalletMenuProps {
  /** Truncated EVM address — shown on the pill + panel hero. */
  displayAddress: string
  /** Full EVM address — used for copy. */
  fullAddress: string
  /** Connected wallet provider name (wagmi connector) — drives the brand glyph. */
  walletProvider?: string
  /** Per-chain USDC balances — one row each, since a shield is per-chain (#8). */
  balances: WalletChainBalance[]
  /** Connected chain name — shown as the hero network tag. */
  networkLabel: string
  /** Address explorer URL; the "Explorer" action is disabled when absent (e.g. local Anvil). */
  explorerUrl?: string
  /** Shared app-wide balance visibility (from balanceHiddenAtom). */
  balanceHidden: boolean
  onBalanceHiddenChange: (hidden: boolean) => void
  onDisconnect: () => void
  onDeposit: () => void
  /** Pill trigger class passthrough (offwhite fill from WalletConnector). */
  triggerClassName?: string
}

export function WalletMenu({
  displayAddress,
  fullAddress,
  walletProvider,
  balances,
  networkLabel,
  explorerUrl,
  balanceHidden,
  onBalanceHiddenChange,
  onDisconnect,
  onDeposit,
  triggerClassName,
}: WalletMenuProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [pillHidden, setPillHidden] = useState(false)
  const [copied, setCopied] = useState(false)
  // The USDC block defaults to a combined "Total" row; expand to reveal the per-chain breakdown (#8).
  const [balancesExpanded, setBalancesExpanded] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearOpenCloseTimers() {
    if (openTimerRef.current) clearTimeout(openTimerRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    openTimerRef.current = null
    closeTimerRef.current = null
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      clearOpenCloseTimers()
    }
  }, [])

  // While the pill is faded out but the panel hasn't opened yet, Escape restores the pill.
  useEffect(() => {
    if (!pillHidden || panelOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      clearOpenCloseTimers()
      setPillHidden(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pillHidden, panelOpen])

  function openMenu() {
    if (pillHidden || panelOpen) return
    clearOpenCloseTimers()
    setPillHidden(true)
    openTimerRef.current = setTimeout(() => {
      setPanelOpen(true)
      openTimerRef.current = null
    }, fadeDelayMs())
  }

  function closeMenu() {
    clearOpenCloseTimers()
    setPanelOpen(false)
    // Wait for the panel's slide-out before fading the pill back in, so they hand off cleanly.
    const restoreDelay = fadeDelayMs() === 0 ? 0 : SIDE_PANEL_EXIT_MS
    closeTimerRef.current = setTimeout(() => {
      setPillHidden(false)
      closeTimerRef.current = null
    }, restoreDelay)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullAddress)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function handleDeposit() {
    closeMenu()
    onDeposit()
  }

  const multiChain = balances.length > 1
  const totalLabel = `${formatUsdcAmount(balances.reduce((sum, r) => sum + r.usdcBalance, 0))} USDC`

  /** A compact per-chain row: chain logo (main) + small USDC inset, chain name, chain balance. */
  function renderChainRow(row: WalletChainBalance) {
    const ChainIcon = chainIconForChainId(row.chainId)
    const balanceLabel = `${formatUsdcAmount(row.usdcBalance)} USDC`
    return (
      <div className={styles.chainRow} key={row.chainId}>
        <span className={styles.chainIcon} aria-hidden>
          <span className={styles.chainGlyph}>
            {ChainIcon ? (
              <ChainIcon size={CHAIN_GLYPH_PX} variant="branded" />
            ) : (
              <TokenUSDC size={CHAIN_GLYPH_PX} variant="branded" />
            )}
          </span>
          {ChainIcon ? (
            <span className={styles.chainUsdcInset}>
              <TokenUSDC size={CHAIN_USDC_INSET_SIZE} variant="branded" />
            </span>
          ) : null}
        </span>
        <div className={styles.tokenIdentity}>
          <p className={styles.tokenName}>{row.networkLabel}</p>
        </div>
        <p className={styles.tokenBalance} aria-label={`${balanceLabel} on ${row.networkLabel}`}>
          <BalanceScrambleValue value={balanceLabel} revealed={!balanceHidden} />
        </p>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={[styles.pill, pillHidden && styles.pillHidden, triggerClassName]
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="dialog"
        aria-expanded={panelOpen || pillHidden}
        tabIndex={pillHidden ? -1 : undefined}
        onClick={openMenu}
      >
        <span className={styles.pillIcon} aria-hidden>
          <WalletProviderIcon provider={walletProvider} size={24} />
        </span>
        <span className={styles.pillLabel}>{displayAddress}</span>
      </button>

      {/* No SidePanel title — the mockup panel has no header bar; the close X floats top-right. */}
      <SidePanel open={panelOpen} onClose={closeMenu} ariaLabel="Wallet">
        <div className={styles.panel}>
          <IconButton
            variant="frosted"
            size="sm"
            className={styles.close}
            aria-label="Close"
            icon={<XMarkIcon strokeWidth={2} aria-hidden />}
            onClick={closeMenu}
          />

          <div className={styles.body}>
            <div className={styles.identity}>
              <span className={styles.heroIcon} aria-hidden>
                <WalletProviderIcon provider={walletProvider} size={HERO_ICON_PX} />
              </span>
              <p className={styles.address}>{displayAddress}</p>
              <span className={styles.networkTag}>{networkLabel}</span>
            </div>

            <div className={styles.actionRow}>
              <BalanceActionButton
                variant="subtle"
                surface="tint"
                className={styles.labeledAction}
                label={balanceHidden ? 'Show' : 'Hide'}
                icon={
                  balanceHidden ? (
                    <EyeSlashIcon strokeWidth={1.5} aria-hidden />
                  ) : (
                    <EyeIcon strokeWidth={1.5} aria-hidden />
                  )
                }
                onClick={() => onBalanceHiddenChange(!balanceHidden)}
              />
              <BalanceActionButton
                variant="subtle"
                surface="tint"
                className={styles.labeledAction}
                label={copied ? 'Copied' : 'Copy'}
                icon={
                  copied ? (
                    <CheckIcon strokeWidth={1.5} aria-hidden />
                  ) : (
                    <ClipboardDocumentIcon strokeWidth={1.5} aria-hidden />
                  )
                }
                onClick={() => void handleCopy()}
              />
              <BalanceActionButton
                variant="subtle"
                surface="tint"
                className={styles.labeledAction}
                label="Explorer"
                icon={<ArrowTopRightOnSquareIcon strokeWidth={1.5} aria-hidden />}
                disabled={!explorerUrl}
                onClick={() => {
                  if (explorerUrl) window.open(explorerUrl, '_blank', 'noopener,noreferrer')
                }}
              />
              <BalanceActionButton
                variant="subtle"
                surface="tint"
                className={styles.labeledAction}
                label="Disconnect"
                icon={<PowerIcon strokeWidth={1.5} aria-hidden />}
                onClick={onDisconnect}
              />
            </div>

            <div className={styles.usdcBlock}>
              <p className={styles.usdcLabel}>Your USDC wallet balance</p>
              {multiChain ? (
                <>
                  {/* Default view: a combined Total row. A shield is per-chain (#8), so expand to see
                      WHERE the balance sits — the per-chain breakdown below. */}
                  <button
                    type="button"
                    className={[styles.usdcRow, styles.usdcTotalRow].join(' ')}
                    aria-expanded={balancesExpanded}
                    aria-controls="wallet-chain-breakdown"
                    onClick={() => setBalancesExpanded((v) => !v)}
                  >
                    <span className={styles.usdcIcon} aria-hidden>
                      <span className={styles.usdcGlyph}>
                        <TokenUSDC size={USDC_GLYPH_SIZE} variant="branded" />
                      </span>
                    </span>
                    <div className={styles.tokenIdentity}>
                      <p className={styles.tokenName}>USDC</p>
                      <p className={styles.tokenNetwork}>{`${balances.length} networks`}</p>
                    </div>
                    <p className={styles.tokenBalance} aria-label={`${totalLabel} total`}>
                      <BalanceScrambleValue value={totalLabel} revealed={!balanceHidden} />
                    </p>
                    <ChevronDownIcon
                      className={[styles.balancesChevron, balancesExpanded && styles.balancesChevronOpen]
                        .filter(Boolean)
                        .join(' ')}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                  {balancesExpanded ? (
                    <div id="wallet-chain-breakdown" className={styles.breakdown}>
                      {balances.map(renderChainRow)}
                    </div>
                  ) : null}
                </>
              ) : (
                // Single chain: no toggle — just show that chain's row directly.
                balances.map(renderChainRow)
              )}
            </div>

            <SendButton
              variant="gradient"
              label="Shield your USDC"
              icon={<PlusIcon className={styles.depositIcon} strokeWidth={1.5} aria-hidden />}
              className={styles.depositButton}
              onClick={handleDeposit}
            />
          </div>
        </div>
      </SidePanel>
    </>
  )
}
