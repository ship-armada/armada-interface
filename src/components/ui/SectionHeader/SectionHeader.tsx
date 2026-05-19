// ABOUTME: Section header — heading text with an optional trailing slot (link, filter chip, action button).
// ABOUTME: Used by Settings sections, Dashboard sub-sections (Recent Activity, In Progress), and History.

import type { ReactNode } from 'react'
import styles from './SectionHeader.module.css'

export interface SectionHeaderProps {
  title: string
  /** Heading level for accessibility. Visual size is fixed by the design — only the tag changes. */
  as?: 'h1' | 'h2' | 'h3' | 'h4'
  trailing?: ReactNode
}

export function SectionHeader({ title, as: Tag = 'h2', trailing }: SectionHeaderProps) {
  return (
    <div className={styles.root}>
      <Tag className={styles.title}>{title}</Tag>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
  )
}
