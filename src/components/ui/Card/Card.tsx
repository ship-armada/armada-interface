// ABOUTME: Surface primitive — bordered card with rounded corners and padded body; raised variant for nested surfaces.
// ABOUTME: Used by BalanceHero, ActionCard, RecentActivityCard, InProgressCard, Settings sections, Modal body.

import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

export type CardVariant = 'default' | 'raised'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  children: ReactNode
}

export function Card({ variant = 'default', className, children, ...rest }: CardProps) {
  const cls = [styles.card, styles[variant], className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}
