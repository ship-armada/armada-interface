// ABOUTME: Dashboard action tile — icon + title + one-line subtitle, full-card button surface for the four primary flows.
// ABOUTME: Caller wires onClick to setOpenModal(...) at the Dashboard level; this component is dumb chrome.

import type { LucideIcon } from 'lucide-react'
import styles from './ActionCard.module.css'

export interface ActionCardProps {
  icon: LucideIcon
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export function ActionCard({ icon: Icon, title, subtitle, onClick, disabled, className }: ActionCardProps) {
  const cls = [styles.card, disabled ? styles.disabled : '', className].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className={styles.title}>{title}</span>
      <span className={styles.subtitle}>{subtitle}</span>
    </button>
  )
}
