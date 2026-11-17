// ABOUTME: Deposit amount card — optional in-card title, chain slot, left-aligned large mono amount, balance/fee row.
// ABOUTME: On a phone (`keypad`) the amount and fee are centered and an on-screen keypad replaces the system keyboard.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { WalletIcon } from '@heroicons/react/24/solid'
import { ArmadaLogo } from '@/design'
import {
  applyKeypadBackspace,
  applyKeypadDecimal,
  applyKeypadDigit,
  formatAmountInputDisplay,
  hasActiveAmount,
  sanitizeAmountEdit,
} from '@/utils/amountInput'
import { BalancePercentMenu } from '@/components/deposit/BalancePercentMenu/BalancePercentMenu'
import { NumericKeypad, type NumericKeypadKey } from '@/components/deposit/NumericKeypad/NumericKeypad'
import { AmountFieldWarning } from '@/components/ui/AmountFieldWarning'
import { FeeBreakdownTooltip, type FlowFeeBreakdown } from '@/components/ui/FeeBreakdownTooltip'
import { WalletProviderIcon } from '@/components/ui/WalletProviderIcon'
import { RollingBalanceValue } from '@/components/dashboard/RollingBalanceValue'
import { formatUsdcAmount, formatUsdcPlain } from '@/lib/format'
import { formatNativeGasAmount, type DisplayFees } from '@/lib/fees/displayFees'
import { incompleteCtaShakeClass } from '@/design'
import styles from './DepositAmountCard.module.css'

/** Font size, in the unitless token scale, that keeps `neededPx` inside `availablePx`. */
function fittedAmountFontSize(neededPx: number, availablePx: number, maxPx: number): number | null {
  if (availablePx <= 1 || neededPx <= 0 || maxPx <= 0) return null
  if (neededPx <= availablePx) return null
  return Math.max(1, Math.floor(((availablePx - 1) / neededPx) * maxPx))
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Space between the caret bar and the digit stroke. The bar itself is half of spacing-1. */
const CARET_GAP_PX = 2
const CARET_BAR_PX = 2

function caretOffset(input: HTMLInputElement): number {
  const index = input.selectionStart ?? input.value.length
  const before = input.value.slice(0, index)
  const computed = getComputedStyle(input)
  const fontSize = Number.parseFloat(computed.fontSize)
  // Geist Mono digits leave 0.05em before the stroke. The glyphs shift back by that
  // amount, so the caret is measured in that same shifted box.
  const inkInset = Number.isFinite(fontSize) ? fontSize * 0.05 : 0
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return before ? 0 : -(CARET_GAP_PX + CARET_BAR_PX)
  context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`
  const origin = -inkInset
  if (!before) {
    const glyph = input.value.slice(index) || '0'
    const metrics = context.measureText(glyph)
    const inkLeft = origin - metrics.actualBoundingBoxLeft
    return inkLeft - CARET_GAP_PX - CARET_BAR_PX
  }
  const metrics = context.measureText(before)
  const inkRight = origin + metrics.actualBoundingBoxRight
  return inkRight + CARET_GAP_PX
}

export interface DepositAmountCardProps {
  /**
   * Network picker on the right of the bottom row, opposite the balance. Omit for flows with
   * no in-card chain row (e.g. Send/Earn, where the chain is chosen on a prior step or is fixed).
   */
  chainSlot?: ReactNode
  /**
   * `armada` marks private or vault funds with the Armada symbol. `wallet` uses the connected
   * wallet's symbol, or a generic wallet icon when that wallet has none.
   */
  balanceSource?: 'armada' | 'wallet'
  /** Connected wallet brand, shown beside a balance that comes from that wallet. */
  walletProvider?: string
  /**
   * Optional node rendered at the very top of the card, above the title (e.g. the Earn flow's
   * Add/Withdraw SegmentedControl). Matches the mockup's in-card `headerSlot`.
   */
  header?: ReactNode
  /** Optional heading rendered inside the card (left-aligned) above the amount. */
  title?: string
  amount: string
  onAmountChange: (value: string) => void
  balance?: string
  /** Not-yet-spendable ("pending") amount, pre-formatted. Shown as a "· X pending" suffix on the
   *  balance row when set — notes still inside the finality buffer, excluded from `balance`/Max. */
  pendingBalance?: string
  /** Value on its way to the private balance, pre-formatted — an in-flight spend's change, an unscanned shield (3B). Shown
   *  as a "· X arriving" suffix: it's in the dashboard headline already, but not spendable (nor in `balance`/Max) yet. */
  arrivingBalance?: string
  /** When set, fee row shows total + breakdown tooltip. */
  displayFees?: DisplayFees
  feeLoading?: boolean
  /**
   * True while the fee path is still being determined — today the shield's relayer-reachability
   * probe (gasless USDC fee vs direct ETH gas is unknown until it settles). Suppresses both fee
   * segments and shows a neutral "Estimating fees…" caption instead of prematurely committing to
   * the direct-path ETH gas figure that may vanish a moment later (#23).
   */
  feeResolving?: boolean
  /**
   * True when the fee can't be worked out for this amount (e.g. a fragmented wallet's send the planner
   * refuses). The caption shows "—" instead of a figure, since any quote would suggest the send fits.
   */
  feeUnavailable?: boolean
  /**
   * True when the user pays network gas themselves — the direct shield path (`!gaslessMode`). Gates
   * the "+ ~X ETH gas" caption segment + the tooltip's network-gas line. Relayer-mediated flows
   * (all spends, gasless shield) pass false: the relayer covers gas, so no ETH figure is shown.
   */
  userPaysNativeGas?: boolean
  /**
   * Optional flow-level breakdown (broadcaster fee, recipient-receives, total-deducted) layered
   * onto the tooltip and into the FEE label total. Used by relayer-mediated / gasless flows
   * where the displayed total USDC fee is `protocolFee + broadcasterFee`.
   */
  flowBreakdown?: FlowFeeBreakdown
  onMax?: () => void
  /**
   * Raw 6-decimal cap the amount input accepts. When provided, the balance row renders
   * 25% / 50% / 75% / Max menu on the balance (each sets the amount to that fraction of `maxInput`);
   * when omitted the card falls back to the single `Max` button (driven by `onMax`).
   */
  maxInput?: bigint
  /**
   * Full (pre-fee) balance the portion menu takes a share of — a % of this, capped at `maxInput`.
   * When omitted the pills fall back to a share of `maxInput` (fine where the cap equals the balance,
   * e.g. shield). Set on fee-on-top paths (send/withdraw/earn) so 25/50/75 land on round balance
   * fractions rather than fractions of the fee-adjusted cap.
   */
  balanceRaw?: bigint
  error?: string
  /** Accessible name for the amount field (e.g. "Deposit amount", "Withdrawal amount"). */
  amountAriaLabel?: string
  /** Ref onto the amount `<input>` — lets a sibling footer focus the field (e.g. the incomplete-CTA nudge). */
  inputRef?: React.Ref<HTMLInputElement>
  /**
   * When true, plays a one-shot shake on the card — the incomplete-CTA nudge (mockup: the field the
   * disabled "Input amount" CTA points at shakes, not the button). Pair with `onShakeAnimationEnd`.
   */
  shaking?: boolean
  /** Clears the shake once the animation finishes; wire to `useNudgeShake().onShakeAnimationEnd`. */
  onShakeAnimationEnd?: (event: React.AnimationEvent<HTMLDivElement>) => void
  /** Phone layout: centered amount, fee under it, balance row, and the on-screen keypad. */
  keypad?: boolean
  /** Sits on the right of the balance row (earn yearly yield). Omitted when a chain picker is shown. */
  balanceAccessory?: ReactNode
}

export function DepositAmountCard({
  chainSlot,
  balanceSource = 'wallet',
  walletProvider,
  header,
  title,
  amount,
  onAmountChange,
  balance = '0.00',
  pendingBalance,
  arrivingBalance,
  displayFees,
  feeLoading = false,
  feeResolving = false,
  feeUnavailable = false,
  userPaysNativeGas = false,
  flowBreakdown,
  onMax,
  maxInput,
  balanceRaw,
  error,
  amountAriaLabel = 'Amount',
  inputRef,
  shaking = false,
  onShakeAnimationEnd,
  keypad = false,
  balanceAccessory,
}: DepositAmountCardProps) {
  const amountInputId = useId()
  const amountErrorId = useId()
  const [amountFocused, setAmountFocused] = useState(false)
  const [caretLeft, setCaretLeft] = useState(0)

  // The flow dialog focuses itself on open, after this card's effects. Focus the amount on the
  // next turn so Shield, Send, and Earn show the field active.
  useEffect(() => {
    if (keypad) return
    if (!inputRef || typeof inputRef === 'function') return
    const id = window.setTimeout(() => {
      const input = inputRef.current
      input?.focus({ preventScroll: true })
      if (input && document.activeElement === input) setAmountFocused(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [inputRef, keypad])

  // Odometer roll for preset/Max taps (mockup): the amount digit-spins from the old value to the new
  // one. A preset handler records where we're rolling *from*; the effect below detects the resulting
  // `amount` change and starts the roll. Typing clears the marker so keystrokes never roll.
  const [amountRoll, setAmountRoll] = useState<{
    fromValue: string
    toValue: string
    trigger: number
  } | null>(null)
  const rollCounterRef = useRef(0)
  const pendingRollFromRef = useRef<string | null>(null)

  // The odometer reports when its last digit has landed (`onRollEnd`); until then the static value
  // stays hidden and the input read-only.
  function clearAmountRoll() {
    setAmountRoll(null)
  }

  // Start the roll once the preset-driven `amount` change lands. Typed changes leave the marker null.
  useEffect(() => {
    const fromValue = pendingRollFromRef.current
    if (fromValue === null) return
    pendingRollFromRef.current = null
    const toValue = hasActiveAmount(amount) ? amount : '0'
    if (prefersReducedMotion() || fromValue === toValue) {
      clearAmountRoll()
      return
    }
    rollCounterRef.current += 1
    const trigger = rollCounterRef.current
    setAmountRoll({ fromValue, toValue, trigger })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roll is keyed off the amount change only.
  }, [amount])

  function handleKeypadKey(key: NumericKeypadKey) {
    clearAmountRoll()
    pendingRollFromRef.current = null
    if (key === 'backspace') {
      onAmountChange(applyKeypadBackspace(amount))
      return
    }
    if (key === '.') {
      onAmountChange(applyKeypadDecimal(amount))
      return
    }
    onAmountChange(applyKeypadDigit(amount, key))
  }

  function handleAmountInput(raw: string) {
    clearAmountRoll()
    pendingRollFromRef.current = null
    // Pass the sanitized value straight through — including forward-typing states like `0`, `.`,
    // and `0.` that `hasActiveAmount` reports false. Rewriting those to `''` (the previous
    // behaviour) discarded a leading `0`/`.` keystroke, making sub-one amounts impossible to type.
    // `hasActiveAmount` still gates display styling (`showActiveAmount`) and the `amount > 0n`
    // submit checks, so a bare `0`/`.` never advances the flow. The edit is read against what the field
    // showed (`displayAmount`, grouped), so a typed comma is a decimal point but our grouping commas aren't.
    onAmountChange(sanitizeAmountEdit(raw, displayAmount))
  }

  /** Mark the current display as the roll origin, then apply the preset amount (the effect rolls it). */
  function applyPreset(nextAmount: string) {
    pendingRollFromRef.current = hasActiveAmount(amount) ? amount : '0'
    onAmountChange(nextAmount)
  }

  // Percentage pills set the amount to a share of the full balance (mockup parity), capped at the
  // fee-aware `maxInput`. When `balanceRaw` isn't supplied (e.g. shield, where the cap equals the
  // balance) they fall back to a share of the cap. Integer bigint math keeps full 6-decimal precision.
  function applyPercent(percent: bigint) {
    if (maxInput === undefined) return
    const share = ((balanceRaw ?? maxInput) * percent) / 100n
    const capped = share < maxInput ? share : maxInput
    applyPreset(formatUsdcPlain(capped))
  }

  // Max reuses the caller's `onMax` when supplied so fee-on-top paths keep their exact cap, else it
  // falls back to the full `maxInput`. Either way the roll origin is marked so the value spins.
  function handleMax() {
    if (onMax) {
      pendingRollFromRef.current = hasActiveAmount(amount) ? amount : '0'
      onMax()
    } else {
      applyPercent(100n)
    }
  }

  const showActiveAmount = hasActiveAmount(amount)
  const isAmountRolling = amountRoll !== null
  // Thousand-grouped for display only ("1,000,000"); the stored `amount` stays ungrouped and the
  // sanitizer strips the grouping commas back out on the next keystroke (mockup parity).
  const displayAmount = formatAmountInputDisplay(amount)
  const cardRef = useRef<HTMLDivElement>(null)
  const amountMeasureRef = useRef<HTMLSpanElement>(null)
  const [fittedAmountFont, setFittedAmountFont] = useState<number | null>(null)
  const amountFitText =
    amountRoll && formatAmountInputDisplay(amountRoll.fromValue).length > (displayAmount || '0').length
      ? formatAmountInputDisplay(amountRoll.fromValue)
      : displayAmount || '0'

  const syncCaret = useCallback(() => {
    const input = inputRef && typeof inputRef !== 'function' ? inputRef.current : null
    if (!input) return
    const next = caretOffset(input)
    setCaretLeft((current) => (Math.abs(current - next) < 0.5 ? current : next))
  }, [inputRef])

  useEffect(() => {
    if (!amountFocused) return
    const onSelectionChange = () => {
      const input = inputRef && typeof inputRef !== 'function' ? inputRef.current : null
      if (document.activeElement !== input) return
      syncCaret()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [amountFocused, inputRef, syncCaret])

  useLayoutEffect(() => {
    if (!amountFocused || isAmountRolling) return
    syncCaret()
  }, [amountFocused, displayAmount, fittedAmountFont, isAmountRolling, syncCaret])

  useLayoutEffect(() => {
    const card = cardRef.current
    const measure = amountMeasureRef.current
    if (!card || !measure) return

    const fit = () => {
      // Fit inside the card's padding. The amount field shrinks to its text, so its own width
      // would shrink the type as soon as a second digit appeared.
      const boxStyle = getComputedStyle(card)
      const padX = (parseFloat(boxStyle.paddingLeft) || 0) + (parseFloat(boxStyle.paddingRight) || 0)
      const available = card.clientWidth - padX
      const max = Number(boxStyle.getPropertyValue('--primitives-fontSize-4xl'))
      const next = fittedAmountFontSize(measure.scrollWidth, available, max)
      setFittedAmountFont((current) => (current === next ? current : next))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(card)
    return () => observer.disconnect()
  }, [amountFitText])

  // Any validation error (over-balance, below-minimum, parse, withdraw fee-shortfall) reddens the
  // amount numeral + balance row (mockup parity) alongside the above-field warning tooltip.
  const hasError = Boolean(error)

  // Total displayed fee (protocol + broadcaster + CCTP — except a CCTP fee taken from the amount in transit, which
  // isn't charged on top). Rendered under the amount once an amount is entered. A non-zero fee keeps
  // its "incl." / "+" caption; a resolved zero reads "$0 FEE".
  const totalFeeRaw = displayFees
    ? displayFees.totalFee + (flowBreakdown?.broadcasterFee ?? 0n)
      + (flowBreakdown?.cctpFeeFromAmount ? 0n : (flowBreakdown?.cctpFee ?? 0n))
    : 0n
  // While the fee path is still resolving we don't yet know if it's gasless (USDC) or direct (ETH
  // gas), so surface a neutral "Estimating…" caption instead of either committed segment.
  const showResolving = showActiveAmount && feeResolving
  const showUnavailable = showActiveAmount && !feeResolving && feeUnavailable
  const feeKnown = showActiveAmount && !feeResolving && !feeUnavailable && displayFees !== undefined
  const showFee = feeKnown && totalFeeRaw > 0n
  // A fee taken from the amount (a shield) or from the proceeds (a vault withdrawal) is included in the figure typed,
  // not added to it — so it reads "incl.", and "+" is left for a fee charged on top (G-7).
  const feePrefix = flowBreakdown?.feesFromAmount || flowBreakdown?.feeFromProceeds ? 'incl.' : '+'
  // The ETH network-gas segment shows ONLY when the caller says the user pays gas themselves — the
  // direct shield path (`!gaslessMode`). This is an explicit signal, NOT inferred from a zero
  // broadcaster fee: a relayer-submitted spend with a not-yet-loaded fee is also 0, and must not
  // surface an ETH gas line. On the direct hub shield there's no USDC fee at all, so this is the
  // only cost the caption can show.
  const nativeGas = displayFees?.nativeGas ?? null
  const showGas = showActiveAmount && !feeResolving && userPaysNativeGas && nativeGas !== null
  // A resolved zero is "$0 FEE", with no breakdown icon. Estimating and "—" stay ahead of it, and a
  // direct shield that only costs network gas keeps that gas line instead of a zero USDC fee.
  const showZeroFee = feeKnown && totalFeeRaw === 0n && !showGas

  const balanceMark =
    balanceSource === 'armada' ? (
      <span className={styles.walletMark} aria-hidden>
        <ArmadaLogo variant="mark" markTone="white" className={styles.markLight} />
        <ArmadaLogo variant="mark" markTone="brand" className={styles.markDark} />
      </span>
    ) : walletProvider ? (
      <span className={styles.walletMark} aria-hidden>
        <WalletProviderIcon provider={walletProvider} />
      </span>
    ) : (
      <WalletIcon
        className={[styles.walletIcon, hasError && styles.walletIconError].filter(Boolean).join(' ')}
        aria-hidden
      />
    )

  const balanceFigure = (
    <>
      {balanceMark}
      <span className={[styles.balanceText, hasError && styles.balanceTextError].filter(Boolean).join(' ')}>
        {balance}
        {pendingBalance ? ` · ${pendingBalance} pending` : ''}
        {arrivingBalance ? ` · ${arrivingBalance} arriving` : ''}
      </span>
    </>
  )

  return (
    <div
      ref={cardRef}
      className={[keypad ? styles.keypad : styles.card, shaking && incompleteCtaShakeClass].filter(Boolean).join(' ')}
      onAnimationEnd={onShakeAnimationEnd}
    >
      <div className={styles.cardTop}>
      {keypad || !header ? null : <div className={styles.cardHeader}>{header}</div>}
      {keypad || !title ? null : <p className={styles.cardTitle}>{title}</p>}

      <div className={styles.amountStack}>
        <label className={styles.amountWrapper} htmlFor={amountInputId}>
          <span className={styles.visuallyHidden}>{amountAriaLabel}</span>
          <span
            data-amount-anchor=""
            className={[styles.amountField, showActiveAmount && styles.amountFieldHasValue]
              .filter(Boolean)
              .join(' ')}
            style={
              fittedAmountFont === null
                ? undefined
                : ({ '--amount-font-size': String(fittedAmountFont) } as CSSProperties)
            }
          >
            <span ref={amountMeasureRef} className={styles.amountMeasure} aria-hidden>
              {amountFitText}
            </span>
            <span
              className={[
                styles.amountDisplay,
                showActiveAmount && styles.amountDisplayActive,
                hasError && styles.amountDisplayError,
                isAmountRolling && styles.amountDisplayRolling,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              {showActiveAmount ? displayAmount : '0'}
            </span>
            <input
              ref={inputRef}
              id={amountInputId}
              type="text"
              inputMode={keypad ? 'none' : 'decimal'}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className={[styles.amountInput, keypad && styles.amountInputInert, isAmountRolling && styles.amountValueHidden]
                .filter(Boolean)
                .join(' ')}
              value={displayAmount}
              onChange={(e) => handleAmountInput(e.target.value)}
              aria-label={amountAriaLabel}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? amountErrorId : undefined}
              readOnly={keypad || isAmountRolling}
              tabIndex={keypad ? -1 : undefined}
              onFocus={() => {
                setAmountFocused(true)
                syncCaret()
              }}
              onBlur={() => setAmountFocused(false)}
            />
            {amountFocused && !isAmountRolling ? (
              <span
                className={[styles.amountCaret, hasError && styles.amountCaretError].filter(Boolean).join(' ')}
                style={{ left: caretLeft }}
                aria-hidden
              />
            ) : null}
            {isAmountRolling && amountRoll ? (
              <span
                className={[
                  styles.amountRollLayer,
                  !showActiveAmount && styles.amountRollInactive,
                  hasError && styles.amountRollError,
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden
              >
                <RollingBalanceValue
                  key={amountRoll.trigger}
                  value={formatAmountInputDisplay(amountRoll.toValue)}
                  fromValue={formatAmountInputDisplay(amountRoll.fromValue)}
                  mode="fromValue"
                  rollTrigger={amountRoll.trigger}
                  rollStartMs={0}
                  onRollEnd={clearAmountRoll}
                />
              </span>
            ) : null}
          </span>
        </label>

        {/* Fee caption under the amount, only once an amount is entered. While the quote is in
            flight the line says "Estimating fees…"; a quote that can't be priced says "—". A
            resolved zero is "$0 FEE" with no info icon. A real fee keeps its figure and the
            breakdown tooltip, and a direct shield adds "+ ~X ETH gas" when the user pays gas. */}
        <AmountFieldWarning
          id={amountErrorId}
          visible={Boolean(error)}
          message={error ?? ''}
          placement="cover"
        >
        <div className={`armada-text-ui-label-md ${styles.feeCaption}`} role="status">
          {showResolving ? (
            <span className={styles.feeResolving}>Estimating fees…</span>
          ) : showUnavailable ? (
            <span>{feePrefix} — FEE</span>
          ) : showZeroFee ? (
            <span>$0 FEE</span>
          ) : (showFee || showGas) && displayFees ? (
            <>
              {showFee ? <span>{feePrefix} ${formatUsdcAmount(totalFeeRaw)} FEE</span> : null}
              {showGas && nativeGas ? <span>+ {formatNativeGasAmount(nativeGas)} gas</span> : null}
              <FeeBreakdownTooltip
                fees={displayFees}
                isLoading={feeLoading}
                flowBreakdown={flowBreakdown}
                userPaysNativeGas={userPaysNativeGas}
              />
            </>
          ) : (
            ' '
          )}
        </div>
        </AmountFieldWarning>
      </div>

      </div>

      <div className={[styles.bottomRow, chainSlot && styles.bottomRowSplit].filter(Boolean).join(' ')}>
        <div className={styles.balanceControls}>
          {maxInput !== undefined || onMax ? (
            <BalancePercentMenu
              className={styles.balanceButton}
              label={`Balance ${balance} USDC, choose a portion`}
              onPick={(ratio) => {
                if (ratio === 1) handleMax()
                else applyPercent(BigInt(Math.round(ratio * 100)))
              }}
            >
              {balanceFigure}
            </BalancePercentMenu>
          ) : (
            <div className={styles.balanceGroup}>{balanceFigure}</div>
          )}
          {chainSlot ? null : balanceAccessory}
        </div>
        {chainSlot ? <div className={styles.chainSlotFooter}>{chainSlot}</div> : null}
      </div>
      {keypad ? (
        <div className={styles.keypadDock}>
          <NumericKeypad className={styles.keypadPad} fullWidth onKey={handleKeypadKey} />
        </div>
      ) : null}
    </div>
  )
}
