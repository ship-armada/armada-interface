// ABOUTME: Tests for SignInCard — the locked dashboard's balance spot: what signing in does, the button by connection state,
// ABOUTME: the wallet's public USDC, why it locked, a pending pay link, and "How this works".

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SignInCard, lockNoteFor, payNoteFor, type SignInCardProps } from './SignInCard'

function renderCard(extra: Partial<SignInCardProps> = {}) {
  const props: SignInCardProps = { connection: 'connected', onSignIn: vi.fn(), ...extra }
  render(<SignInCard {...props} />)
  return props
}

describe('lockNoteFor / payNoteFor', () => {
  it('says why the wallet locked', () => {
    expect(lockNoteFor('idle', 15)).toBe('Locked after 15 minutes of inactivity.')
    expect(lockNoteFor('hidden', 15)).toBe('Locked while the tab was in the background.')
    expect(lockNoteFor('manual', 15)).toBe('You locked Armada.')
    expect(lockNoteFor(null, 15)).toBeNull()
  })

  it('names the pending payment — the amount when the link set one', () => {
    const recipient = '0zk1' + 'a'.repeat(60) + 'ab12cd'
    expect(payNoteFor({ recipient, amount: '25' })).toMatch(/^Sign in to pay 25\.00 USDC to 0zk1.+cd$/)
    expect(payNoteFor({ recipient })).toMatch(/^Sign in to pay 0zk1/)
    expect(payNoteFor(null)).toBeNull()
  })
})

describe('<SignInCard>', () => {
  it('says what signing in does, with no balance figure', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Your private USDC' })).toBeInTheDocument()
    expect(
      screen.getByText('Sign a message (not a transaction) to unlock your private balance. No seed phrase — the same wallet unlocks it on any device.'),
    ).toBeInTheDocument()
  })

  it('the button connects first when there is no wallet, then signs in', () => {
    const onSignIn = vi.fn()
    renderCard({ connection: 'disconnected', onSignIn })
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('connected, the button signs in', () => {
    const onSignIn = vi.fn()
    renderCard({ connection: 'connected', onSignIn })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('while the wallet reconnects, says so instead of offering "Connect wallet"', () => {
    renderCard({ connection: 'reconnecting' })
    expect(screen.getByRole('button', { name: 'Reconnecting…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Connect wallet' })).toBeNull()
  })

  it('shows the wallet\'s public USDC as a reason to sign in, and nothing at zero', () => {
    const { rerender } = render(<SignInCard connection="connected" publicUsdc="120.00" onSignIn={vi.fn()} />)
    expect(screen.getByText('You have 120.00 USDC in your wallet — sign in to shield it.')).toBeInTheDocument()
    rerender(<SignInCard connection="connected" publicUsdc={null} onSignIn={vi.fn()} />)
    expect(screen.queryByText(/in your wallet — sign in to shield it/)).toBeNull()
  })

  it('says why it locked, and what a pending pay link is waiting for', () => {
    renderCard({ lockNote: 'Locked after 15 minutes of inactivity.', payNote: 'Sign in to pay 25.00 USDC to 0zk1…ab12' })
    expect(screen.getByText('Locked after 15 minutes of inactivity.')).toBeInTheDocument()
    expect(screen.getByText('Sign in to pay 25.00 USDC to 0zk1…ab12')).toBeInTheDocument()
  })

  it('"How this works" explains the signature', () => {
    renderCard()
    const toggle = screen.getByRole('button', { name: 'How this works' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/a message, not a transaction/)).toBeInTheDocument()
  })

})
