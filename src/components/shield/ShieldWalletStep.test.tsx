// ABOUTME: Tests for ShieldWalletStep — the title/subtitle transition + checklist render.
// ABOUTME: "Preparing…" while every row is pending; "Step X of N · Confirm in your wallet" / "…Waiting for the network".

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShieldWalletStep } from './ShieldWalletStep'
import type { WalletStep } from '@/lib/tx/shieldWalletSteps'

describe('ShieldWalletStep', () => {
  it('renders the checklist under the mockup title, with the "Preparing…" footer while pending', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'pending' },
      { label: 'Sign shield transaction', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(
      screen.getByRole('heading', { name: 'Confirm transactions in your wallet' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Wallet confirmations' })).toBeInTheDocument()
    expect(screen.getByText('Sign shield transaction')).toBeInTheDocument()
    // Proof still building → honest "preparing" footer (no prompt live yet).
    expect(screen.getByText('Preparing your shield…')).toBeInTheDocument()
  })

  it('once a prompt is live: "Step 1 of 2 · Confirm in your wallet", and the row says where it is (4B)', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'loading', detail: 'In your wallet' },
      { label: 'Submit 5.00 USDC shield', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(screen.getByText('Step 1 of 2 \u00b7 Confirm in your wallet')).toBeInTheDocument()
    expect(screen.getByText('In your wallet')).toBeInTheDocument()
  })

  it('while the approval confirms, says the network is confirming it — not "waiting for wallet" (4B)', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'confirming', detail: 'Confirming on chain' },
      { label: 'Submit 5.00 USDC shield', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(screen.getByText('Step 1 of 2 \u00b7 Waiting for the network to confirm')).toBeInTheDocument()
    expect(screen.queryByText(/Confirm in your wallet/)).toBeNull()
  })

  it('shows why the wallet is asking under the active row (4C)', () => {
    const steps: WalletStep[] = [
      { label: 'Approve 5.00 USDC', status: 'loading', detail: 'In your wallet', why: 'Lets Armada\u2019s contract take exactly 5.00 USDC from your wallet.' },
      { label: 'Submit 5.00 USDC shield', status: 'pending' },
    ]
    render(<ShieldWalletStep steps={steps} />)
    expect(screen.getByText('Lets Armada\u2019s contract take exactly 5.00 USDC from your wallet.')).toBeInTheDocument()
  })
})

