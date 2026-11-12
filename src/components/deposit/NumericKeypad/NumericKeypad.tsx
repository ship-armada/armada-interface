// ABOUTME: On-screen numeric keypad for the phone amount step — digits, a decimal point, and delete.
// ABOUTME: The amount card owns the value; this control only reports which key was pressed.

import { BackspaceIcon } from '@heroicons/react/24/outline'
import styles from './NumericKeypad.module.css'

export type NumericKeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'backspace'

export interface NumericKeypadProps {
  onKey: (key: NumericKeypadKey) => void
  className?: string
  fullWidth?: boolean
}

const KEYS: readonly NumericKeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'backspace',
]

export function NumericKeypad({ onKey, className, fullWidth = false }: NumericKeypadProps) {
  const rootClassName = [styles.root, fullWidth && styles.rootFullWidth, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClassName} role="group" aria-label="Amount keypad">
      {KEYS.map((key) => {
        const isBackspace = key === 'backspace'
        return (
          <button
            key={key}
            type="button"
            className={[styles.key, isBackspace && styles.keyBackspace].filter(Boolean).join(' ')}
            onClick={() => onKey(key)}
            aria-label={isBackspace ? 'Delete' : key === '.' ? 'Decimal point' : key}
          >
            {isBackspace ? (
              <BackspaceIcon className={styles.backspaceIcon} strokeWidth={1.5} aria-hidden />
            ) : (
              key
            )}
          </button>
        )
      })}
    </div>
  )
}
