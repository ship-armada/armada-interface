// ABOUTME: Tests for VaultPositionBar — the earned figure (real value or ???), the rate as APY or "—", the ⓘs explaining the rate
// ABOUTME: (naming the vault fee) and Earned, and that the bar still opens the vault while an ⓘ opens only its tooltip.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VaultPositionBar } from './VaultPositionBar'
import { EARNED_EXPLANATION } from '@/lib/yield'

/** Open an InfoTip's tooltip — it shows on hover of the trigger's Tooltip wrapper. */
function openTip(trigger: HTMLElement) {
  fireEvent.mouseEnter(trigger.parentElement as HTMLElement)
}

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

  it('explains the rate — current, after the vault\'s fee on earnings (12C)', () => {
    render(<VaultPositionBar balance={1.05} apy={4.2} yieldFeeBps={1_000n} balanceHidden={false} />)
    openTip(screen.getByRole('button', { name: 'About this rate' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('after the vault\u2019s 10% fee on earnings')
  })

  it('explains the earned figure (12D)', () => {
    render(<VaultPositionBar balance={1.05} earnedAmount={0.05} balanceHidden={false} />)
    openTip(screen.getByRole('button', { name: 'About earned' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent(EARNED_EXPLANATION)
  })

  it('the bar still opens the vault; an ⓘ only opens its tooltip', () => {
    const onOpen = vi.fn()
    render(<VaultPositionBar balance={1.05} apy={4.2} balanceHidden={false} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'About this rate' }))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Manage shielded vault' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
