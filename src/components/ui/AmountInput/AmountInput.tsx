// ABOUTME: USDC amount input with `display` (big serif numeral) and `compact` variants, MAX shortcut, AVAILABLE caption, and inline errors.
// ABOUTME: Display variant matches the committer mockup's "How much USDC?" style; compact is the standard form-input shape.

import { useId } from 'react'
import { formatUsdcAmount, formatUsdcPlain } from '@/lib/format'
import styles from './AmountInput.module.css'

export type AmountInputVariant = 'compact' | 'display'

export interface AmountInputProps {
  /** Controlled raw input string (free typing). Use parseUsdcInput to convert before submit. */
  value: string
  onValueChange: (next: string) => void
  /** Maximum spendable amount (raw 6-decimal bigint). Drives the AVAILABLE caption + MAX button. */
  max?: bigint
  /** Label rendered above the input. */
  label?: string
  /** Unit suffix in the display variant (e.g. "USDC"). Hidden in compact. */
  unit?: string
  variant?: AmountInputVariant
  disabled?: boolean
  /** Error message rendered below the input. */
  error?: string
  /** Optional onBlur — useful for normalising the typed value (trim trailing dots, etc.). */
  onBlur?: () => void
}

export function AmountInput({
  value,
  onValueChange,
  max,
  label,
  unit = 'USDC',
  variant = 'compact',
  disabled,
  error,
  onBlur,
}: AmountInputProps) {
  const id = useId()
  const hasMax = max !== undefined

  function setMax() {
    if (max === undefined) return
    onValueChange(formatUsdcPlain(max))
  }

  if (variant === 'display') {
    return (
      <div className={styles.displayRoot}>
        {label ? (
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
        ) : null}
        <div className={styles.displayRow}>
          <input
            id={id}
            className={styles.displayInput}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => onValueChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            placeholder="0"
            aria-label={label ?? 'Amount'}
          />
          <span className={styles.unit}>{unit}</span>
        </div>
        {hasMax ? (
          <div className={styles.captions}>
            <span className={styles.captionAvailable}>
              AVAILABLE {formatUsdcAmount(max)}
            </span>
            <button
              type="button"
              onClick={setMax}
              className={styles.maxBtn}
              disabled={disabled}
            >
              MAX
            </button>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        ) : null}
      </div>
    )
  }

  // compact variant
  return (
    <div className={styles.compactRoot}>
      {label ? (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      ) : null}
      <div className={styles.compactRow}>
        <input
          id={id}
          className={styles.compactInput}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="0.00"
          aria-label={label ?? 'Amount'}
        />
        {hasMax ? (
          <button
            type="button"
            onClick={setMax}
            className={styles.compactMaxBtn}
            disabled={disabled}
          >
            MAX
          </button>
        ) : null}
      </div>
      {hasMax ? (
        <div className={styles.compactAvailable}>
          Available {formatUsdcAmount(max)} USDC
        </div>
      ) : null}
      {error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
    </div>
  )
}
