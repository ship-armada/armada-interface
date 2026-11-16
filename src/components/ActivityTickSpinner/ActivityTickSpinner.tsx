// ABOUTME: 24-tick lavender ring used for a syncing balance, an in-progress activity row, and a wallet step.
// ABOUTME: `static` keeps the same ticks at one weight, with no sweep, for a step that has not started.

import { useMemo, type CSSProperties } from 'react'
import styles from './ActivityTickSpinner.module.css'

/** Same 24-tick sweep as the balance sync ring. */
const TICK_COUNT = 24

export function ActivityTickSpinner({ variant = 'sweep' }: { variant?: 'sweep' | 'static' }) {
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, index) => index), [])
  const tickClassName = variant === 'static' ? `${styles.tick} ${styles.tickStatic}` : styles.tick

  return (
    <span className={styles.ring} aria-hidden>
      {ticks.map((index) => (
        <span key={index} className={tickClassName} style={{ '--i': index } as CSSProperties} />
      ))}
    </span>
  )
}
