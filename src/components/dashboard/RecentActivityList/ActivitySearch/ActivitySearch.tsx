// ABOUTME: Search input for filtering activity by tx hash, counterparty address or (while balances are shown) amount —
// ABOUTME: controlled value + onChange. Uses design TextField (ported parity with armada-app mockup).

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { TextField } from '@/design'
import styles from './ActivitySearch.module.css'

export interface ActivitySearchProps {
  value: string
  onChange: (value: string) => void
  /** Whether a typed number searches amounts — off while balances are hidden (the placeholder then omits it). */
  amountsSearchable: boolean
  surface?: 'frost' | 'raised'
}

export function ActivitySearch({
  value,
  onChange,
  amountsSearchable,
  surface = 'raised',
}: ActivitySearchProps) {
  return (
    <label className={styles.root}>
      <TextField
        type="search"
        size="md"
        surface={surface}
        valueFont="mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={amountsSearchable ? 'Search address, amount or tx hash' : 'Search address or tx hash'}
        spellCheck={false}
        autoComplete="off"
        inputMode="search"
        aria-label="Search activity"
        leading={<MagnifyingGlassIcon strokeWidth={1.75} />}
      />
    </label>
  )
}
