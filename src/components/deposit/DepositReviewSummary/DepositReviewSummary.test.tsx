// ABOUTME: Tests for DepositReviewSummary — the estimated (cross-chain) affordance on the "You'll receive" total.
// ABOUTME: A cross-chain shield's final amount depends on the CCTP fee at delivery, so it renders `≈` + a caption.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DepositReviewSummary } from './DepositReviewSummary'

describe('<DepositReviewSummary>', () => {
  it('renders the exact total (no ≈, no caption) for a same-chain deposit', () => {
    const { container, queryByText } = render(
      <DepositReviewSummary fromChainId={31337} amount={3_000_000n} fee={25_651n} netAmount={2_974_349n} />,
    )
    expect(container.textContent).toContain('2.974349 USDC')
    expect(container.textContent).not.toContain('≈')
    expect(queryByText(/depends on the CCTP fee/i)).toBeNull()
  })

  it('marks the total as an estimate (≈ + caption) when estimated', () => {
    const { container, getByText } = render(
      <DepositReviewSummary
        fromChainId={84532}
        amount={3_000_000n}
        fee={25_651n}
        netAmount={2_974_349n}
        estimated
      />,
    )
    expect(container.textContent).toContain('≈ 2.974349 USDC')
    expect(getByText(/the final amount depends on the CCTP fee charged at delivery/i)).toBeInTheDocument()
  })

  const nativeGas = { wei: 1_234_560_000_000_000n, symbol: 'ETH', formatted: '0.00123456' }

  it('renders a "Network gas" row (~ETH) on the direct path when nativeGas is provided', () => {
    const { getByText } = render(
      <DepositReviewSummary
        fromChainId={31337}
        amount={3_000_000n}
        fee={0n}
        netAmount={3_000_000n}
        nativeGas={nativeGas}
      />,
    )
    expect(getByText('Network gas')).toBeInTheDocument()
    expect(getByText('~0.0012 ETH')).toBeInTheDocument()
  })

  it('omits the gas row on the confirmation/receipt view (confirmedAt set)', () => {
    const { queryByText } = render(
      <DepositReviewSummary
        fromChainId={31337}
        amount={3_000_000n}
        fee={0n}
        netAmount={3_000_000n}
        nativeGas={nativeGas}
        confirmedAt={Date.now()}
      />,
    )
    expect(queryByText('Network gas')).toBeNull()
  })

  it('omits the gas row on the gasless path (no nativeGas)', () => {
    const { queryByText } = render(
      <DepositReviewSummary fromChainId={31337} amount={3_000_000n} fee={25_651n} netAmount={2_974_349n} />,
    )
    expect(queryByText('Network gas')).toBeNull()
  })
})
