// ABOUTME: Tests for SignInCard — the locked dashboard's inline sign-in: the button by connection / signing state, "Connected as",
// ABOUTME: the error, why it locked or which pay link waits, the restore link, and the first-visit two-signature banner (FirstSignInBanner).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FirstSignInBanner, SignInCard, lockNoteFor, payNoteFor, type SignInCardProps } from './SignInCard'

function renderCard(extra: Partial<SignInCardProps> = {}) {
  const props: SignInCardProps = { connection: 'connected', onSignIn: vi.fn(), onRestore: vi.fn(), ...extra }
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
  const address = '0xabcdef0123456789abcdef0123456789abcdef01'

  it('explains the signature-derived wallet, with no balance figure', () => {
    renderCard()
    expect(
      screen.getByText(
        'Your shielded wallet is derived from a signature your EVM wallet produces — no passphrase, no recovery phrase.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Sign in from any device with the same wallet.')).toBeInTheDocument()
    expect(screen.queryByText(/\d+\.\d{2}/)).toBeNull()
  })

  it('disconnected, the button connects first and there is no "Connected as"', () => {
    const { onSignIn } = renderCard({ connection: 'disconnected', address })
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Connected as/)).toBeNull()
  })

  it('connected, the button signs in, under it the shortened wallet address', () => {
    const { onSignIn } = renderCard({ address })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(screen.getByText(/Connected as/)).toHaveTextContent('Connected as 0xabcd...ef01')
  })

  it('while the wallet reconnects, says so instead of offering "Connect wallet"', () => {
    renderCard({ connection: 'reconnecting' })
    expect(screen.getByRole('button', { name: 'Reconnecting…' })).toBeDisabled()
  })

  it('while the wallet prompt is open, the button waits for the signature', () => {
    renderCard({ address, submitting: true })
    const button = screen.getByRole('button', { name: 'Waiting for signature…' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('a failed sign-in shows its message', () => {
    renderCard({ address, error: 'Signature request declined.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Signature request declined.')
  })

  it('says what a pending pay link is waiting for, else why it locked', () => {
    const { rerender } = render(<SignInCard connection="connected" lockNote="You locked Armada." onSignIn={vi.fn()} onRestore={vi.fn()} />)
    expect(screen.getByText('You locked Armada.')).toBeInTheDocument()
    rerender(<SignInCard connection="connected" lockNote="You locked Armada." payNote="Sign in to pay 25.00 USDC to 0zk1…" onSignIn={vi.fn()} onRestore={vi.fn()} />)
    expect(screen.getByText('Sign in to pay 25.00 USDC to 0zk1…')).toBeInTheDocument()
    expect(screen.queryByText('You locked Armada.')).toBeNull()
  })

  it('"Restore wallet from backup instead" opens the restore', () => {
    const { onRestore } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Restore wallet from backup instead' }))
    expect(onRestore).toHaveBeenCalledOnce()
  })

  it('the first-visit banner says to expect two signatures', () => {
    render(<FirstSignInBanner />)
    expect(screen.getByText('First time on this device?')).toBeInTheDocument()
    expect(screen.getByText(/two signatures to confirm your wallet is compatible/)).toBeInTheDocument()
  })
})
