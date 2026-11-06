// ABOUTME: Tests for LockedDashboard — the dashboard before sign-in: the sign-in card in the balance spot and a placeholder
// ABOUTME: where activity shows once signed in (history is encrypted).

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LockedDashboard } from './LockedDashboard'

const card = { connection: 'connected' as const, onSignIn: vi.fn() }

describe('<LockedDashboard>', () => {
  it('shows the sign-in card and says activity appears once signed in', () => {
    render(<LockedDashboard card={card} />)
    expect(screen.getByRole('heading', { name: 'Your private USDC' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to see your activity.')).toBeInTheDocument()
  })
})
