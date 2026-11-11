// ABOUTME: Tests for ShieldReviewStep — renders amount + chain name + dispatches Back/Confirm.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShieldReviewStep } from './ShieldReviewStep'

function setup() {
  const onBack = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ShieldReviewStep
      fromChainId={31337}
      amount={100_500_000n}
      fee={null}
      netAmount={100_500_000n}
      onBack={onBack}
      onConfirm={onConfirm}
    />,
  )
  return { onBack, onConfirm }
}

describe('<ShieldReviewStep>', () => {
  it('fires onConfirm on the primary CTA', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('fires onBack on the secondary CTA', () => {
    const { onBack } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('disables Confirm and surfaces the reason when submitBlockedReason is set (relayer resolving)', () => {
    const onConfirm = vi.fn()
    render(
      <ShieldReviewStep
        fromChainId={31337}
        amount={100_500_000n}
        fee={null}
        netAmount={100_500_000n}
        submitBlockedReason="Checking relayer…"
        onBack={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByText('Checking relayer…')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: /^Confirm$/ })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders a "Network gas" row when a direct-path nativeGas estimate is provided', () => {
    render(
      <ShieldReviewStep
        fromChainId={31337}
        amount={100_500_000n}
        fee={null}
        netAmount={100_500_000n}
        nativeGas={{ wei: 1_234_560_000_000_000n, symbol: 'ETH', formatted: '0.00123456' }}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Network gas')).toBeInTheDocument()
    expect(screen.getByText('~0.0012 ETH')).toBeInTheDocument()
  })

  it('explains a gasless shield\'s fees as relayer + protocol, and offers no ⓘ when the path isn\'t known (5A)', () => {
    const { unmount } = render(
      <ShieldReviewStep fromChainId={31337} amount={10_000_000n} fee={1_020_014n} netAmount={8_979_986n} gasless onBack={vi.fn()} onConfirm={vi.fn()} />,
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'What is this fee?' }).parentElement as HTMLElement)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.split(':')[0])).toEqual(['Relayer fee', 'Protocol fee'])
    unmount()
    setup()
    expect(screen.queryByRole('button', { name: 'What is this fee?' })).toBeNull()
  })

  it('says what the wallet will ask: two signatures and no gas when gasless; up to two transactions when direct (4A)', () => {
    const { unmount } = render(
      <ShieldReviewStep fromChainId={31337} amount={10_000_000n} fee={1_020_014n} netAmount={8_979_986n} gasless onBack={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(screen.getByText('Wallet prompts').nextElementSibling).toHaveTextContent('2 signatures, no gas')
    unmount()
    render(
      <ShieldReviewStep fromChainId={31337} amount={10_000_000n} fee={20_011n} netAmount={9_979_989n} gasless={false} onBack={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(screen.getByText('Wallet prompts').nextElementSibling).toHaveTextContent('Up to 2 transactions: approve, then shield')
  })

  it('over 25% in fees, holds Confirm until acknowledged (5D)', () => {
    render(<ShieldReviewStep fromChainId={31337} amount={2_000_000n} fee={1_020_014n} netAmount={979_986n} gasless onBack={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('note', { name: 'High fees for this amount' })).toHaveTextContent('Fees are 51% of this amount.')
    expect(screen.getByRole('button', { name: /^Confirm$/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /^Confirm$/ })).toBeEnabled()
  })
})
