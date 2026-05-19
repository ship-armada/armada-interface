// ABOUTME: Collapsible "Show technical details" disclosure — built on native <details>/<summary> for free a11y + reduced-motion behavior.
// ABOUTME: Used by TxLifecycleStepper to hide tx hashes, attestation hashes, explorer links, and error stacks behind progressive disclosure.

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import styles from './TechnicalDetailsDisclosure.module.css'

export interface TechnicalDetailsDisclosureProps {
  /** Label rendered next to the chevron when collapsed. Defaults to "Show technical details". */
  label?: string
  /** Whether the disclosure starts open. Wired to the user's "show technical details by default" preference at the page level. */
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function TechnicalDetailsDisclosure({
  label = 'Show technical details',
  defaultOpen = false,
  children,
  className,
}: TechnicalDetailsDisclosureProps) {
  const cls = [styles.root, className].filter(Boolean).join(' ')
  return (
    <details className={cls} open={defaultOpen}>
      <summary className={styles.summary}>
        <ChevronRight className={styles.chevron} size={14} aria-hidden="true" />
        <span>{label}</span>
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
