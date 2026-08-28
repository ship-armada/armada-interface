// ABOUTME: Search input for filtering activity by transaction hash — controlled value + onChange.
// ABOUTME: Uses design TextField (ported parity with armada-app mockup).

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { TextField } from '@/design'
import styles from './ActivityTxHashSearch.module.css'

export interface ActivityTxHashSearchProps {
  value: string
  onChange: (value: string) => void
  surface?: 'frost' | 'raised'
}

export function ActivityTxHashSearch({
  value,
  onChange,
  surface = 'raised',
}: ActivityTxHashSearchProps) {
  return (
    <label className={styles.root}>
      <TextField
        type="search"
        size="md"
        surface={surface}
        valueFont="mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste transaction hash"
        spellCheck={false}
        autoComplete="off"
        inputMode="search"
        aria-label="Search by transaction hash"
        leading={<MagnifyingGlassIcon strokeWidth={1.75} />}
      />
    </label>
  )
}
