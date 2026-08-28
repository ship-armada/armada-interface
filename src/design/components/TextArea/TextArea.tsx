// ABOUTME: Shared multiline text control with frost surfaces and optional character count.
// ABOUTME: Ported from the armada-app design mockup; presentational only (labels live with callers).

import { useId, type TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

export type TextAreaSurface = 'frostRaised' | 'hover'

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  surface?: TextAreaSurface
  showCount?: boolean
  className?: string
}

export function TextArea({
  surface = 'frostRaised',
  showCount = false,
  className,
  id,
  maxLength,
  value,
  ...textareaProps
}: TextAreaProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const length = String(value ?? '').length

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <textarea
        {...textareaProps}
        id={inputId}
        value={value}
        maxLength={maxLength}
        className={[
          styles.input,
          surface === 'hover' ? styles.surfaceHover : styles.surfaceFrostRaised,
        ].join(' ')}
      />
      {showCount && maxLength != null ? (
        <p className={styles.count}>
          {length}/{maxLength}
        </p>
      ) : null}
    </div>
  )
}
