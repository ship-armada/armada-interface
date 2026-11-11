// ABOUTME: Render tests for the dashboard RecentActivityList — empty state, rows, pending subtitle, view-all + row clicks,
// ABOUTME: and the full list's date sections (Pending / Today / …) that the flat preview doesn't have.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecentActivityList } from './RecentActivityList'
import styles from './RecentActivityList.module.css'
import scrambleStyles from '../BalanceScrambleValue/BalanceScrambleValue.module.css'
import type { DashboardActivityItem } from '@/components/dashboard/txActivityAdapter'

const items: DashboardActivityItem[] = [
  { id: 'a', kind: 'deposit', label: 'Deposit', amount: 5, occurredAt: Date.now(), status: 'settled', pending: false },
  { id: 'b', kind: 'send', label: 'Private transfer', amount: -2, occurredAt: Date.now(), status: 'pending', pending: true },
]

/** The description's strike class (CSS-module keys type as possibly undefined). */
const LABEL_STRUCK = styles.labelStruck ?? 'labelStruck'

/** Whether a row's amount renders struck (BalanceScrambleValue's strike). */
const struckAmount = (row: HTMLElement): boolean => row.querySelector(`.${scrambleStyles.struck}`) !== null

describe('RecentActivityList', () => {
  it('shows the empty state when there are no items', () => {
    render(<RecentActivityList items={[]} />)
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
  })

  it('renders a row per item with its label', () => {
    render(<RecentActivityList items={items} />)
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.getByText('Private transfer')).toBeInTheDocument()
  })

  it('marks pending items with a "Pending" subtitle', () => {
    render(<RecentActivityList items={items} />)
    expect(screen.getByText(/^Pending •/)).toBeInTheDocument()
  })

  it('labels failed + cancelled items and strikes their amount', () => {
    const failedCancelled: DashboardActivityItem[] = [
      { id: 'f', kind: 'send', label: 'Private transfer', amount: -2, occurredAt: Date.now(), status: 'failed', pending: false },
      { id: 'c', kind: 'deposit', label: 'Deposit', amount: 5, occurredAt: Date.now(), status: 'cancelled', pending: false },
    ]
    render(<RecentActivityList items={failedCancelled} balanceRevealed />)
    expect(screen.getByText(/^Failed •/)).toBeInTheDocument()
    expect(screen.getByText(/^Cancelled •/)).toBeInTheDocument()
    // Nothing settled, so both the description and the amount are struck through.
    for (const label of ['Private transfer', 'Deposit']) expect(screen.getByText(label)).toHaveClass(LABEL_STRUCK)
    for (const row of screen.getAllByRole('button')) expect(struckAmount(row)).toBe(true)
  })

  it('does not label or strike an indeterminate (unknown) item', () => {
    const unknown: DashboardActivityItem[] = [
      { id: 'u', kind: 'send', label: 'Private transfer', amount: -2, occurredAt: Date.now(), status: 'unknown', pending: false },
    ]
    render(<RecentActivityList items={unknown} balanceRevealed />)
    expect(screen.getByText(/^Unknown •/)).toBeInTheDocument()
    // WHY: an unknown outcome may still have gone through — it must not look failed.
    expect(screen.getByText('Private transfer')).not.toHaveClass(LABEL_STRUCK)
    expect(struckAmount(screen.getByRole('button'))).toBe(false)
  })

  it('the full list sections its rows by date under headings; the preview stays flat', () => {
    const { rerender } = render(<RecentActivityList items={items} variant="full" />)
    expect(screen.getByRole('heading', { name: 'Pending' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    rerender(<RecentActivityList items={items} variant="preview" />)
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
  })

  it('fires onViewAll when "View all" is clicked', () => {
    const onViewAll = vi.fn()
    render(<RecentActivityList items={items} onViewAll={onViewAll} />)
    fireEvent.click(screen.getByRole('button', { name: 'View all' }))
    expect(onViewAll).toHaveBeenCalledOnce()
  })

  it('fires onItemClick with the clicked item', () => {
    const onItemClick = vi.fn()
    render(<RecentActivityList items={items} onItemClick={onItemClick} />)
    fireEvent.click(screen.getByText('Deposit'))
    expect(onItemClick).toHaveBeenCalledWith(items[0])
  })

  it('shows the full date and time on hover over the row time (8B)', () => {
    const at = new Date(2026, 0, 5, 15, 42).getTime()
    render(
      <RecentActivityList
        items={[{ id: 'h', kind: 'deposit', label: 'Deposit', amount: 5, occurredAt: at, status: 'settled', pending: false }]}
      />,
    )
    expect(screen.getByTitle('Jan 5, 2026 · 3:42 PM')).toBeInTheDocument()
  })
})

