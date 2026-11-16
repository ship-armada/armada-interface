// ABOUTME: Tests for ShieldWalletStep — the title sits in the checklist card, with no step footer.
// ABOUTME: "In your wallet" is not rendered. The active row still shows why the wallet is asking.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShieldWalletStep } from './ShieldWalletStep'
import type { WalletStep } from '@/lib/tx/shieldWalletSteps'

describe('ShieldWalletStep', () => {
  it('renders the checklist under the title, with no preparing footer', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'pending' },
      { label: 'Sign shield transaction', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(
      screen.getByRole('heading', { name: 'Confirm transactions in your wallet' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('Sign shield transaction')).toBeInTheDocument()
    expect(screen.queryByText('Preparing your shield…')).toBeNull()
    expect(screen.queryByText(/Step \d of \d/)).toBeNull()
  })

  it('does not print "In your wallet" while a prompt is live', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'loading', detail: 'In your wallet' },
      { label: 'Submit 5.00 USDC shield', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(screen.queryByText('In your wallet')).toBeNull()
    expect(screen.queryByText(/Confirm in your wallet/)).toBeNull()
    expect(screen.getByRole('listitem', { name: 'Approve 5.00 USDC, Loading' })).toBeInTheDocument()
  })

  it('does not say the network is confirming in a footer', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'confirming', detail: 'Confirming on chain' },
      { label: 'Submit 5.00 USDC shield', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(screen.queryByText(/Waiting for the network/)).toBeNull()
    expect(screen.queryByText('Confirming on chain')).toBeNull()
    expect(screen.getByRole('listitem', { name: 'Approve 5.00 USDC, Confirming' })).toBeInTheDocument()
  })

  it('shows why the wallet is asking under the active row', () => {
    const steps: WalletStep[] = [
      {
        label: 'Approve 5.00 USDC',
        status: 'loading',
        why: 'Approves 5.00 USDC. Nothing moves yet.',
      },
      { label: 'Submit 5.00 USDC shield', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(screen.getByText('Approves 5.00 USDC. Nothing moves yet.')).toBeInTheDocument()
  })
})
