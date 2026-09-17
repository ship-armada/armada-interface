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
})
