// ABOUTME: Render tests for the dashboard RecentActivityList — empty state, the locked (pre-sign-in) state, rows, pending subtitle,
// ABOUTME: view-all + row clicks, and the full list's date sections (Pending / Today / …) that the flat preview doesn't have.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecentActivityList } from './RecentActivityList'
import type { DashboardActivityItem } from '@/components/dashboard/txActivityAdapter'

const items: DashboardActivityItem[] = [
  { id: 'a', kind: 'deposit', label: 'Deposit', amount: 5, occurredAt: Date.now(), status: 'settled', pending: false },
  { id: 'b', kind: 'send', label: 'Private transfer', amount: -2, occurredAt: Date.now(), status: 'pending', pending: true },
]

describe('RecentActivityList', () => {
  it('shows the empty state when there are no items', () => {
    render(<RecentActivityList items={[]} />)
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
  })

  it('locked: the same heading, no "View all", and a sign-in message in place of the list', () => {
    render(<RecentActivityList items={items} locked onViewAll={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to view')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View all' })).not.toBeInTheDocument()
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument()
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
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
    render(<RecentActivityList items={failedCancelled} />)
    expect(screen.getByText(/^Failed •/)).toBeInTheDocument()
    expect(screen.getByText(/^Cancelled •/)).toBeInTheDocument()
  })

  it('does not label or strike an indeterminate (unknown) item', () => {
    const unknown: DashboardActivityItem[] = [
      { id: 'u', kind: 'send', label: 'Private transfer', amount: -2, occurredAt: Date.now(), status: 'unknown', pending: false },
    ]
    render(<RecentActivityList items={unknown} />)
    expect(screen.getByText(/^Unknown •/)).toBeInTheDocument()
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

