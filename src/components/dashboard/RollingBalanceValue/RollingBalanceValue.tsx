// ABOUTME: Odometer-style rolling numeric display that animates balance digits into place.
// ABOUTME: Ported from the armada-app design mockup.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  balanceRevealRollDurationMs,
  balanceRevealRollStartMs,
  BALANCE_ROLL_DIGIT_STAGGER_MS,
} from '@/components/dashboard/BalanceCard/balanceRevealMotion'
import styles from './RollingBalanceValue.module.css'

const DIGIT_SPIN_CYCLES = 1
/** How long an alignment-padding column takes to fold away (or open) during a fromValue roll. */
const PADDING_FOLD_MS = 450
/** Margin after the last column lands before `onRollEnd`, so its final frame has painted. */
const ROLL_SETTLE_BUFFER_MS = 80

export type BalanceRollMode = 'fromZero' | 'fromValue'

type BalanceToken =
  | { type: 'digit'; digit: number; key: string; digitIndex: number }
  | { type: 'separator'; char: string; key: string }

type DisplayDigit = {
  type: 'digit'
  key: string
  digitIndex: number
  fromDigit: number
  toDigit: number
  /** Whether this column is part of the starting / target value (false = alignment padding). */
  inFrom: boolean
  inTo: boolean
}

type DisplaySeparator = {
  type: 'separator'
  char: string
  key: string
  /** Index of the digit column that follows, so the separator folds in step with it. */
  digitIndex: number
  inFrom: boolean
  inTo: boolean
}

type DisplayToken = DisplayDigit | DisplaySeparator

function tokenizeBalance(value: string): BalanceToken[] {
  const tokens: BalanceToken[] = []
  let digitIndex = 0

  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i)
    if (char >= '0' && char <= '9') {
      tokens.push({
        type: 'digit',
        digit: Number(char),
        digitIndex,
        key: `d-${i}`,
      })
      digitIndex += 1
      continue
    }

    tokens.push({ type: 'separator', char, key: `s-${i}` })
  }

  return tokens
}

function parseAmountParts(value: string): { intDigits: number[]; fracDigits: number[] } {
  const cleaned = value.replace(/,/g, '')
  const dot = cleaned.indexOf('.')
  const intPart = (dot === -1 ? cleaned : cleaned.slice(0, dot)) || '0'
  const fracPart = dot === -1 ? '' : cleaned.slice(dot + 1)
  return {
    intDigits: intPart.split('').map((char) => Number(char)),
    fracDigits: fracPart.split('').map((char) => Number(char)),
  }
}

function groupedIntegerSkeleton(intDigits: number[]): string {
  return intDigits.join('').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Split into integer/fraction and pad each side independently so digits stay aligned on the
// decimal point across a roll — otherwise a width change (e.g. 1,000.00 → 250.00) misaligns the
// from/to digit columns and the roll passes through garbage intermediate numbers.
function buildDisplayTokens(
  toValue: string,
  mode: BalanceRollMode,
  fromValue?: string,
): DisplayToken[] {
  if (mode !== 'fromValue' || !fromValue) {
    return tokenizeBalance(toValue).map((token, index, tokens) => {
      const digitIndex = tokens.slice(0, index).filter((item) => item.type === 'digit').length
      if (token.type === 'separator') {
        return { type: 'separator', char: token.char, key: token.key, digitIndex, inFrom: true, inTo: true }
      }
      return {
        type: 'digit',
        key: token.key,
        digitIndex,
        fromDigit: 0,
        toDigit: token.digit,
        inFrom: true,
        inTo: true,
      }
    })
  }

  const from = parseAmountParts(fromValue)
  const to = parseAmountParts(toValue)
  const intWidth = Math.max(from.intDigits.length, to.intDigits.length, 1)
  const fracWidth = Math.max(from.fracDigits.length, to.fracDigits.length)
  const fromLengths = { int: from.intDigits.length, frac: from.fracDigits.length }
  const toLengths = { int: to.intDigits.length, frac: to.fracDigits.length }
  // The padding below is for alignment only and is never shown as zeros: a column that is padding in
  // a value is collapsed while the row shows that value. Integer padding sits on the left, fraction
  // padding on the right, so a column is real when it falls inside that value's own digits.
  const isRealColumn = (column: number, lengths: { int: number; frac: number }) =>
    column < intWidth ? column >= intWidth - lengths.int : column - intWidth < lengths.frac

  while (from.intDigits.length < intWidth) from.intDigits.unshift(0)
  while (to.intDigits.length < intWidth) to.intDigits.unshift(0)
  while (from.fracDigits.length < fracWidth) from.fracDigits.push(0)
  while (to.fracDigits.length < fracWidth) to.fracDigits.push(0)

  const skeleton =
    fracWidth > 0
      ? `${groupedIntegerSkeleton(to.intDigits)}.${'0'.repeat(fracWidth)}`
      : groupedIntegerSkeleton(to.intDigits)

  const fromDigits = [...from.intDigits, ...from.fracDigits]
  const toDigits = [...to.intDigits, ...to.fracDigits]
  let digitIndex = 0

  return tokenizeBalance(skeleton).map((token) => {
    if (token.type === 'separator') {
      // The decimal point is real when the value has a fraction; a thousands comma is real when the
      // digit to its left is.
      const isPoint = token.char === '.'
      return {
        type: 'separator',
        char: token.char,
        key: token.key,
        digitIndex,
        inFrom: isPoint ? fromLengths.frac > 0 : isRealColumn(digitIndex - 1, fromLengths),
        inTo: isPoint ? toLengths.frac > 0 : isRealColumn(digitIndex - 1, toLengths),
      }
    }

    const displayDigit: DisplayDigit = {
      type: 'digit',
      key: token.key,
      digitIndex,
      fromDigit: fromDigits[digitIndex] ?? 0,
      toDigit: toDigits[digitIndex] ?? 0,
      inFrom: isRealColumn(digitIndex, fromLengths),
      inTo: isRealColumn(digitIndex, toLengths),
    }
    digitIndex += 1
    return displayDigit
  })
}

/**
 * Fold styling for a column that is padding in the starting or target value. Columns that belong to
 * both values get nothing, so the plain reveal and unaffected columns are untouched. A column leaving
 * the row keeps rolling and finishes folding exactly as its own (staggered) roll lands; a column
 * joining the row opens straight away.
 */
function paddingFold(
  token: { digitIndex: number; inFrom: boolean; inTo: boolean },
  animating: boolean,
  rollDurationMs: number,
  digitStaggerMs: number,
): { className: string; style: CSSProperties } | null {
  if (token.inFrom && token.inTo) return null
  const present = animating ? token.inTo : token.inFrom
  const leaving = animating && !present
  const delayMs = Math.max(0, rollDurationMs - PADDING_FOLD_MS + token.digitIndex * digitStaggerMs)
  return {
    className: [styles.paddingFold, !present && styles.collapsed].filter(Boolean).join(' '),
    style: {
      transitionDuration: `${PADDING_FOLD_MS}ms`,
      transitionDelay: leaving ? `${delayMs}ms` : undefined,
    },
  }
}

/** Time from roll start until the last (staggered) column has landed, plus the settle buffer. */
function settleMsForColumns(columns: number, rollDurationMs: number, digitStaggerMs: number): number {
  return rollDurationMs + Math.max(0, columns - 1) * digitStaggerMs + ROLL_SETTLE_BUFFER_MS
}

/**
 * How long a roll to `value` takes to settle once it starts (excluding any `rollStartMs` delay). It
 * counts every column the odometer rolls — a fromValue roll's alignment padding included — so it can
 * run longer than `value`'s own digits suggest. For callers that end a roll on their own timer
 * (e.g. one timer covering several odometers); a single odometer can use `onRollEnd` instead.
 */
export function rollSettleMs(
  value: string,
  {
    mode = 'fromZero',
    fromValue,
    rollDurationMs = balanceRevealRollDurationMs(),
    digitStaggerMs = BALANCE_ROLL_DIGIT_STAGGER_MS,
  }: {
    mode?: BalanceRollMode
    fromValue?: string
    rollDurationMs?: number
    digitStaggerMs?: number
  } = {},
): number {
  const columns = buildDisplayTokens(value, mode, fromValue).filter((token) => token.type === 'digit')
  return settleMsForColumns(columns.length, rollDurationMs, digitStaggerMs)
}

function digitEndOffset(fromDigit: number, toDigit: number): number {
  if (fromDigit === toDigit) return fromDigit
  const delta = (toDigit - fromDigit + 10) % 10
  return fromDigit + DIGIT_SPIN_CYCLES * 10 + delta
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface RollingBalanceValueProps {
  value: string
  className?: string
  enableRoll?: boolean
  mode?: BalanceRollMode
  fromValue?: string
  rollTrigger?: number
  rollStartMs?: number
  rollDurationMs?: number
  digitStaggerMs?: number
  /**
   * Called once the roll has settled — after the last (staggered) column has landed — or straight
   * away when nothing rolls (reduced motion / `enableRoll` off). Lets a caller that swaps the
   * odometer for a static value do so without re-deriving this component's timing.
   */
  onRollEnd?: () => void
}

function DigitColumn({
  fromDigit,
  toDigit,
  digitIndex,
  animating,
  visible,
  rollDurationMs,
  digitStaggerMs,
  fold,
}: {
  fromDigit: number
  toDigit: number
  digitIndex: number
  animating: boolean
  visible: boolean
  rollDurationMs: number
  digitStaggerMs: number
  fold: ReturnType<typeof paddingFold>
}) {
  const startOffset = fromDigit
  const endOffset = digitEndOffset(fromDigit, toDigit)
  const offset = animating ? endOffset : startOffset
  const shouldAnimate = animating && endOffset !== startOffset

  return (
    <span
      className={[styles.digitColumn, visible ? styles.digitVisible : styles.digitHidden, fold?.className]
        .filter(Boolean)
        .join(' ')}
      style={fold?.style}
      aria-hidden
    >
      <span
        className={
          shouldAnimate ? `${styles.digitTrack} ${styles.digitTrackRoll}` : styles.digitTrack
        }
        style={
          {
            '--digit-offset': offset,
            transitionDuration: shouldAnimate ? `${rollDurationMs}ms` : undefined,
            transitionDelay: shouldAnimate ? `${digitIndex * digitStaggerMs}ms` : undefined,
          } as CSSProperties
        }
      >
        {Array.from({ length: (DIGIT_SPIN_CYCLES + 2) * 10 }, (_, index) => (
          <span key={index} className={styles.digitCell}>
            {index % 10}
          </span>
        ))}
      </span>
    </span>
  )
}

export function RollingBalanceValue({
  value,
  className,
  enableRoll = true,
  mode = 'fromZero',
  fromValue,
  rollTrigger = 0,
  rollStartMs = balanceRevealRollStartMs(),
  rollDurationMs = balanceRevealRollDurationMs(),
  digitStaggerMs = BALANCE_ROLL_DIGIT_STAGGER_MS,
  onRollEnd,
}: RollingBalanceValueProps) {
  const reducedMotion = prefersReducedMotion()
  const shouldRoll = enableRoll && !reducedMotion
  const [visible, setVisible] = useState(!shouldRoll || mode === 'fromValue')
  const [animating, setAnimating] = useState(false)
  const tokens = useMemo(
    () => buildDisplayTokens(value, mode, fromValue),
    [value, mode, fromValue],
  )

  useEffect(() => {
    if (!shouldRoll) {
      setVisible(true)
      setAnimating(false)
      return
    }

    if (mode === 'fromValue') {
      setVisible(true)
      setAnimating(false)

      let frame2 = 0
      const frame1 = window.requestAnimationFrame(() => {
        frame2 = window.requestAnimationFrame(() => setAnimating(true))
      })

      return () => {
        window.cancelAnimationFrame(frame1)
        window.cancelAnimationFrame(frame2)
      }
    }

    setVisible(false)
    setAnimating(false)

    const delay = rollTrigger === 0 ? rollStartMs : 0
    const timer = window.setTimeout(() => {
      setVisible(true)
      setAnimating(true)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [shouldRoll, mode, rollStartMs, rollTrigger, value, fromValue])

  // Keep the latest callback without making it a dependency — a parent re-render passing a new
  // closure must not restart the settle timer.
  const onRollEndRef = useRef(onRollEnd)
  useEffect(() => {
    onRollEndRef.current = onRollEnd
  })

  // Every column (padding included) rolls, so the last one starts `(count - 1) × stagger` in.
  const columnCount = tokens.filter((token) => token.type === 'digit').length

  useEffect(() => {
    if (!shouldRoll) {
      onRollEndRef.current?.()
      return
    }
    if (!animating) return
    const timer = window.setTimeout(
      () => onRollEndRef.current?.(),
      settleMsForColumns(columnCount, rollDurationMs, digitStaggerMs),
    )
    return () => window.clearTimeout(timer)
  }, [shouldRoll, animating, rollDurationMs, digitStaggerMs, columnCount])

  const rootClassName = [styles.root, className].filter(Boolean).join(' ')

  if (!shouldRoll) {
    return (
      <span className={rootClassName} aria-label={value}>
        {value}
      </span>
    )
  }

  return (
    <span className={rootClassName} aria-label={value}>
      {tokens.map((token) => {
        const fold = paddingFold(token, animating, rollDurationMs, digitStaggerMs)
        return token.type === 'digit' ? (
          <DigitColumn
            key={token.key}
            fromDigit={token.fromDigit}
            toDigit={token.toDigit}
            digitIndex={token.digitIndex}
            animating={animating}
            visible={visible}
            rollDurationMs={rollDurationMs}
            digitStaggerMs={digitStaggerMs}
            fold={fold}
          />
        ) : (
          <span
            key={token.key}
            className={[styles.separator, visible && styles.separatorVisible, fold?.className]
              .filter(Boolean)
              .join(' ')}
            style={fold?.style}
            aria-hidden
          >
            {token.char}
          </span>
        )
      })}
    </span>
  )
}
