// ABOUTME: Shared text input chrome — frost/raised surfaces, optional leading/trailing slots + clear.
// ABOUTME: Ported from the armada-app design mockup; presentational only (labels live with callers).

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import styles from './TextField.module.css'

export type TextFieldSize = 'md' | 'lg'
export type TextFieldSurface = 'frost' | 'raised' | 'frostRaised'
export type TextFieldValueFont = 'ui' | 'mono'

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'className'> {
  size?: TextFieldSize
  surface?: TextFieldSurface
  valueFont?: TextFieldValueFont
  leading?: ReactNode
  trailing?: ReactNode
  clearable?: boolean
  clearAriaLabel?: string
  onClear?: () => void
  className?: string
}

const SURFACE_CLASS: Record<TextFieldSurface, string> = {
  frost: styles.surfaceFrost!,
  raised: styles.surfaceRaised!,
  frostRaised: styles.surfaceFrostRaised!,
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    size = 'md',
    surface = 'raised',
    valueFont = 'ui',
    leading,
    trailing,
    clearable = false,
    clearAriaLabel = 'Clear',
    onClear,
    className,
    id,
    type = 'text',
    value,
    ...inputProps
  },
  ref,
) {
  const hasValue = String(value ?? '').length > 0

  return (
    <span
      className={[
        styles.field,
        size === 'lg' ? styles.sizeLg : styles.sizeMd,
        SURFACE_CLASS[surface],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {leading ? (
        <span className={styles.slot} aria-hidden>
          {leading}
        </span>
      ) : null}
      <input
        {...inputProps}
        ref={ref}
        id={id}
        type={type}
        value={value}
        className={[styles.input, valueFont === 'mono' ? styles.inputMono : styles.inputUi].join(' ')}
      />
      {clearable ? (
        <button
          type="button"
          className={[styles.clearButton, !hasValue ? styles.clearButtonHidden : ''].filter(Boolean).join(' ')}
          aria-label={clearAriaLabel}
          aria-hidden={!hasValue}
          tabIndex={hasValue ? 0 : -1}
          disabled={!hasValue}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onClear?.()}
        >
          <XMarkIcon className={styles.clearIcon} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      {trailing ? (
        <span className={styles.slot} aria-hidden>
          {trailing}
        </span>
      ) : null}
    </span>
  )
})
