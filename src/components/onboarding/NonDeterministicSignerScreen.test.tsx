// ABOUTME: Tests for NonDeterministicSignerScreen — the headline + the two CTAs (use-recovery / try-different-wallet) for
// ABOUTME: both error reasons, and the supported / unsupported wallet compatibility lists.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NonDeterministicSignerScreen } from './NonDeterministicSignerScreen'

describe('<NonDeterministicSignerScreen>', () => {
  it('renders the first-sign-mismatch headline + CTAs', () => {
    const onUseRecovery = vi.fn()
    const onTryDifferentWallet = vi.fn()
    render(
      <NonDeterministicSignerScreen
        reason="first-sign-mismatch"
        onUseRecovery={onUseRecovery}
        onTryDifferentWallet={onTryDifferentWallet}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent(/can't unlock by signing/i)
    expect(screen.getByText(/randomize signatures/i)).toBeInTheDocument()
  })

  it('renders the cached-checksum-mismatch headline for returning sign-ins', () => {
    render(
      <NonDeterministicSignerScreen
        reason="cached-checksum-mismatch"
        onUseRecovery={vi.fn()}
        onTryDifferentWallet={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading')).toHaveTextContent(/different identity/i)
    expect(screen.getByText(/changed underlying accounts/i)).toBeInTheDocument()
  })

  it('includes the supported + unsupported wallet compatibility lists', () => {
    render(
      <NonDeterministicSignerScreen
        reason="first-sign-mismatch"
        onUseRecovery={vi.fn()}
        onTryDifferentWallet={vi.fn()}
      />,
    )
    expect(screen.getByText('MetaMask')).toBeInTheDocument()
    expect(screen.getByText('Rabby')).toBeInTheDocument()
    expect(screen.getByText('Frame')).toBeInTheDocument()
    expect(screen.getByText('Safe / Gnosis Safe')).toBeInTheDocument()
    expect(screen.getByText(/ERC-4337/)).toBeInTheDocument()
  })

})
