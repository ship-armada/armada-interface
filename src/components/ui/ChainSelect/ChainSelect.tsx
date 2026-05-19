// ABOUTME: ChainSelect — dropdown over the configured chains in network.ts (hub + clients by default).
// ABOUTME: Renders a native <select> for v1; the styled-popover treatment can come later if real UX demands it.

import { useId, useMemo } from 'react'
import { getAllChainIdentities, type ChainIdentity } from '@/config/network'
import styles from './ChainSelect.module.css'

export interface ChainSelectProps {
  /** Selected chainId. */
  value: number
  onChange: (chainId: number) => void
  /** Subset of chains to offer; defaults to [hub, ...clients]. */
  chains?: ReadonlyArray<ChainIdentity>
  label?: string
  disabled?: boolean
  className?: string
}

export function ChainSelect({ value, onChange, chains, label, disabled, className }: ChainSelectProps) {
  const id = useId()
  // useMemo so the default chain list is stable across renders without re-running getAllChainIdentities.
  const options = useMemo(() => chains ?? getAllChainIdentities(), [chains])
  const cls = [styles.root, className].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {label ? (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
      >
        {options.map(c => (
          <option key={c.chainId} value={c.chainId}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}
