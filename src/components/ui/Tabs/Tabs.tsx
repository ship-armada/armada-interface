// ABOUTME: Tabs — horizontal segmented control with ARIA tablist semantics. Generic over a string id union.
// ABOUTME: Used by SendModal (Private / External) and Earn (Add / Withdraw); two-consumer threshold is the promotion bar to @armada/ui.

import styles from './Tabs.module.css'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  disabled?: boolean
}

export interface TabsProps<T extends string = string> {
  items: ReadonlyArray<TabItem<T>>
  selected: T
  onSelect: (id: T) => void
  /** Accessible label for the tablist. Required for screen readers. */
  ariaLabel: string
  className?: string
}

export function Tabs<T extends string = string>({
  items,
  selected,
  onSelect,
  ariaLabel,
  className,
}: TabsProps<T>) {
  const cls = [styles.root, className].filter(Boolean).join(' ')
  return (
    <div className={cls} role="tablist" aria-label={ariaLabel}>
      {items.map(item => {
        const active = item.id === selected
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`tabpanel-${item.id}`}
            id={`tab-${item.id}`}
            disabled={item.disabled}
            onClick={() => onSelect(item.id)}
            className={[styles.tab, active ? styles.active : ''].filter(Boolean).join(' ')}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
