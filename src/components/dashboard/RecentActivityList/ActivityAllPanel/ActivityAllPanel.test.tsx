// ABOUTME: Render/interaction test for the ActivityAllPanel — search (hash, address, amount — amounts only while shown),
// ABOUTME: kind chips, and the no-matches state with "Clear filters".

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityAllPanel } from './ActivityAllPanel'
import type { DashboardActivityItem } from '@/components/dashboard/txActivityAdapter'

const items: DashboardActivityItem[] = [
  {
    id: 'a',
    kind: 'deposit',
    label: 'Shield from Base',
    amount: 5,
    occurredAt: Date.now(),
    txHash: '0xaaa111',
    status: 'settled',
    pending: false,
  },
  {
    id: 'b',
    kind: 'send',
    label: 'Private transfer',
    amount: -2,
    occurredAt: Date.now(),
    txHash: '0xbbb222',
    address: '0zk1qyrecipientk9f2',
    status: 'settled',
    pending: false,
  },
]

describe('ActivityAllPanel', () => {
  it('renders the filtered activity list when open', () => {
    render(<ActivityAllPanel open onClose={() => {}} items={items} />)
    expect(screen.getByText('Shield from Base')).toBeInTheDocument()
    expect(screen.getByText('Private transfer')).toBeInTheDocument()
  })

  it('shows the empty state when the search excludes everything', () => {
    render(<ActivityAllPanel open onClose={() => {}} items={items} />)
    fireEvent.change(screen.getByLabelText('Search activity'), {
      target: { value: '0xnope' },
    })
    expect(screen.getByText('No transactions match your filters.')).toBeInTheDocument()
    expect(screen.queryByText('Shield from Base')).not.toBeInTheDocument()
  })

  it('finds a row by its counterparty address or its amount', () => {
    render(<ActivityAllPanel open onClose={() => {}} items={items} />)
    const search = screen.getByLabelText('Search activity')
    fireEvent.change(search, { target: { value: 'k9f2' } })
    expect(screen.getByText('Private transfer')).toBeInTheDocument()
    expect(screen.queryByText('Shield from Base')).toBeNull()
    fireEvent.change(search, { target: { value: '5' } })
    expect(screen.getByText('Shield from Base')).toBeInTheDocument()
    expect(screen.queryByText('Private transfer')).toBeNull()
  })

  it('does not match amounts while balances are hidden', () => {
    render(<ActivityAllPanel open onClose={() => {}} items={items} balanceRevealed={false} />)
    fireEvent.change(screen.getByLabelText('Search activity'), { target: { value: '5' } })
    expect(screen.getByText('No transactions match your filters.')).toBeInTheDocument()
  })

  it('"Clear filters" in the no-matches state resets the search and the kind chip', () => {
    render(<ActivityAllPanel open onClose={() => {}} items={items} />)
    fireEvent.change(screen.getByLabelText('Search activity'), { target: { value: '0xnope' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Unshield' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByLabelText('Search activity')).toHaveValue('')
    expect(screen.getByText('Shield from Base')).toBeInTheDocument()
    expect(screen.getByText('Private transfer')).toBeInTheDocument()
  })

  it('filters by kind chip', () => {
    render(<ActivityAllPanel open onClose={() => {}} items={items} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Unshield' }))
    expect(screen.getByText('No transactions match your filters.')).toBeInTheDocument()
  })

  it('shows the "showing latest N" note only when truncatedCount is set', () => {
    const { rerender } = render(<ActivityAllPanel open onClose={() => {}} items={items} />)
    expect(screen.queryByText(/most recent transactions/)).toBeNull()
    rerender(<ActivityAllPanel open onClose={() => {}} items={items} truncatedCount={500} />)
    expect(screen.getByText('Showing your 500 most recent transactions.')).toBeInTheDocument()
  })
})
