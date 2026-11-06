// ABOUTME: Tests for VaultPositionBar — the accrued "earned" figure shows a real value when supplied, else the ??? placeholder;
// ABOUTME: the rate reads as APY in the shared format, or "—" when unknown (never a hard-coded rate).

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VaultPositionBar } from './VaultPositionBar'

describe('<VaultPositionBar>', () => {
  it('renders the real accrued yield when earnedAmount is supplied', () => {
    render(<VaultPositionBar balance={1.05} earnedAmount={0.05} balanceHidden={false} />)
    expect(screen.getByLabelText('+0.05 earned')).toBeInTheDocument()
    expect(screen.queryByLabelText('??? earned')).toBeNull()
  })

  it('falls back to the ??? placeholder when earnedAmount is undefined', () => {
    render(<VaultPositionBar balance={1.05} balanceHidden={false} />)
    expect(screen.getByLabelText('??? earned')).toBeInTheDocument()
  })

  it('renders nothing when the vault balance is empty', () => {
    const { container } = render(<VaultPositionBar balance={0} earnedAmount={0} balanceHidden={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('labels the rate as APY in the shared two-decimal format', () => {
    render(<VaultPositionBar balance={1.05} apy={4.2} balanceHidden={false} />)
    expect(screen.getByLabelText('Earning 4.20% APY')).toBeInTheDocument()
    expect(screen.queryByText(/APR/)).toBeNull()
  })

  it('shows "—" for the rate when it is not known yet, never a hard-coded value', () => {
    const { container } = render(<VaultPositionBar balance={1.05} balanceHidden={false} />)
    expect(screen.getByLabelText('Earning — APY')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\d+\.\d+%/)
  })
})
