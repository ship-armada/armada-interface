// ABOUTME: Tests for SyncCard — the balance spot while the first sync runs after sign-in: progress with no balance figure, what
// ABOUTME: works meanwhile (Shield / Request; Send / Earn wait for the balance), and the failure state (funds safe, Try again, help).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SyncCard, type SyncCardProps } from './SyncCard'
import { SUPPORT_URL } from '@/config/support'

function renderCard(extra: Partial<SyncCardProps> = {}) {
  const props: SyncCardProps = {
    progress: 0.42, failed: false, retried: false, firstSync: false, onRetry: vi.fn(), onAction: vi.fn(), ...extra,
  }
  render(<SyncCard {...props} />)
  return props
}

describe('<SyncCard>', () => {
  it('shows the sync progress and no balance figure', () => {
    renderCard()
    const meter = screen.getByRole('progressbar', { name: 'Loading your private balance' })
    expect(meter).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('Syncing… 42%')).toBeInTheDocument()
    expect(screen.getByText(/keep this tab open until it finishes/)).toBeInTheDocument()
  })

  it("on a device's first sync, says it takes longer", () => {
    renderCard({ firstSync: true })
    expect(screen.getByText('Scanning the chain from the start — this first sync takes longer.')).toBeInTheDocument()
  })

  it('Shield and Request work meanwhile; Send and Earn wait for the balance', () => {
    const onAction = vi.fn()
    renderCard({ onAction })
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    fireEvent.click(screen.getByRole('button', { name: 'Request' }))
    expect(onAction).toHaveBeenNthCalledWith(1, 'shield')
    expect(onAction).toHaveBeenNthCalledWith(2, 'request')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Earn' })).toBeDisabled()
  })

  it('a failed sync says the funds are safe on chain, with Try again', () => {
    const onRetry = vi.fn()
    renderCard({ failed: true, onRetry })
    expect(screen.getByText('Sync interrupted')).toBeInTheDocument()
    expect(screen.getByText(/Your funds are safe on chain/)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByRole('link', { name: /Get help/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('once a retry has failed too, adds what to check and a link to get help', () => {
    renderCard({ failed: true, retried: true })
    expect(screen.getByText(/Still not loading\?/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Get help on Discord/ })).toHaveAttribute('href', SUPPORT_URL)
  })
})
