// ABOUTME: Tests for LockedDashboard — the dashboard before sign-in: the sign-in card in the balance spot, the earn banner from
// ABOUTME: the public APY (asking to sign in on tap), and a placeholder where activity shows once signed in (history is encrypted).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LockedDashboard } from './LockedDashboard'

const card = { connection: 'connected' as const, onSignIn: vi.fn(), onAction: vi.fn() }

describe('<LockedDashboard>', () => {
  it('shows the sign-in card and says activity appears once signed in', () => {
    render(<LockedDashboard card={card} earnBanner={null} />)
    expect(screen.getByRole('heading', { name: 'Your private USDC' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to see your activity.')).toBeInTheDocument()
  })

  it('shows the earn banner from the public APY, and tapping it asks to sign in', () => {
    const onDeposit = vi.fn()
    render(
      <LockedDashboard
        card={card}
        earnBanner={{ headline: 'Earn ~4.20% APY', ariaLabel: 'Estimated yearly yield ~4.20%', infoTooltip: 'x', onDeposit }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Estimated yearly yield ~4.20%' }))
    expect(onDeposit).toHaveBeenCalledOnce()
  })
})
