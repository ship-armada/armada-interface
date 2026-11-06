// ABOUTME: Tests for EarnInputStep — tab switching, amount validation against tab-specific maxInput, APY copy in each rate state,
// ABOUTME: the rate's ⓘ (naming the vault fee), the deposit's estimated yearly yield, and the "How the shielded vault works" panel.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EarnInputStep, type EarnTab } from './EarnInputStep'
import type { YieldRate } from '@/hooks/useYieldRate'
import type { DisplayFees } from '@/lib/fees/displayFees'

// useGasBalanceWarning hits wagmi's useAccount/useBalance which need a WagmiProvider; these
// tests don't mount one.
vi.mock('@/hooks/useGasBalanceWarning', () => ({
  useGasBalanceWarning: () => ({
    show: false,
    nativeSymbol: 'ETH',
    formattedBalance: null,
  }),
}))

const ZERO_FEES: DisplayFees = {
  protocolFee: 0n,
  gasFee: 0n,
  nativeGas: null,
  totalFee: 0n,
  feeInclusive: false,
}

function setup(extras?: {
  tab?: EarnTab
  amountStr?: string
  max?: bigint
  rate?: YieldRate | null
}) {
  const max = extras?.max ?? 5_000_000n
  const props = {
    tab: extras?.tab ?? 'add' as EarnTab,
    onTabChange: vi.fn(),
    amountStr: extras?.amountStr ?? '',
    onAmountChange: vi.fn(),
    max,
    maxInput: max,
    displayFees: ZERO_FEES,
    feeLoading: false,
    gasChainId: 31337,
    rate: extras?.rate ?? null as YieldRate | null,
    onCancel: vi.fn(),
    onContinue: vi.fn(),
  }
  render(<EarnInputStep {...props} />)
  return props
}

/** Open a tooltip whichever way the trigger's Tooltip listens (hover on fine pointers, tap otherwise). */
function openTip(trigger: HTMLElement) {
  fireEvent.mouseEnter(trigger.closest('div') as HTMLElement)
  if (!screen.queryByRole('tooltip')) fireEvent.click(trigger)
}

const RATE: YieldRate = { rate: 1_000_000n, apyBps: 420n, yieldFeeBps: 1_000n, fetchedAt: 0 }

describe('<EarnInputStep> yield clarity (package 15)', () => {
  it('the rate\'s ⓘ says it is current, after the vault\'s fee on earnings (12C)', () => {
    setup({ rate: RATE })
    openTip(screen.getByRole('button', { name: 'About the APY estimate' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Current yearly rate after the vault\u2019s 10% fee on earnings.')
  })

  it('a deposit shows what it would earn in a year at today\'s rate (12E)', () => {
    setup({ rate: RATE, amountStr: '100' })
    expect(screen.getByText('Est. yearly yield')).toBeInTheDocument()
    expect(screen.getByText('\u2248 4.20 USDC')).toBeInTheDocument()
  })

  it('no yearly yield on a withdrawal, without an amount, or before the rate loads', () => {
    setup({ rate: RATE, amountStr: '100', tab: 'withdraw' })
    expect(screen.queryByText('Est. yearly yield')).toBeNull()
  })

  it('no yearly yield without an amount or a rate', () => {
    setup({ rate: RATE, amountStr: '' })
    expect(screen.queryByText('Est. yearly yield')).toBeNull()
  })

  it('"How the shielded vault works" opens a short explainer naming the source, the fee and the risks (12F)', () => {
    setup({ rate: RATE })
    const toggle = screen.getByRole('button', { name: 'How the shielded vault works' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('region', { name: 'How the shielded vault works' })
    expect(panel).toHaveTextContent(/lends your USDC on Aave/)
    expect(panel).toHaveTextContent(/keeps 10% of what you earn/)
    expect(panel).toHaveTextContent(/Risks/)
  })
})

describe('<EarnInputStep>', () => {
  it('renders Add to vault and Withdraw tabs', () => {
    setup()
    expect(screen.getByRole('tab', { name: 'Add to vault' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Withdraw' })).toBeInTheDocument()
  })

  it('hides the chain row (the vault has no chain selection)', () => {
    setup()
    expect(screen.queryByText(/Anvil Hub/)).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('renders the 25% / 50% / 75% / Max percent pills', () => {
    setup()
    for (const label of ['25%', '50%', '75%', 'Max']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('shows the APY banner on the Add tab', () => {
    setup({ tab: 'add', rate: { rate: 1_000_000n, apyBps: 450n, fetchedAt: 0 } })
    expect(screen.getByText('Earn ~4.50% APY')).toBeInTheDocument()
  })

  it('shows the APY banner on the Withdraw tab too (matches the mockup)', () => {
    setup({ tab: 'withdraw', rate: { rate: 1_000_000n, apyBps: 450n, fetchedAt: 0 } })
    expect(screen.getByText('Earn ~4.50% APY')).toBeInTheDocument()
  })

  it('uses the vault-deposit aria-label when tab=add', () => {
    setup({ tab: 'add' })
    expect(screen.getByLabelText('Shielded vault deposit amount')).toBeInTheDocument()
  })

  it('uses the vault-withdraw aria-label when tab=withdraw', () => {
    setup({ tab: 'withdraw' })
    expect(screen.getByLabelText('Shielded vault withdrawal amount')).toBeInTheDocument()
  })

  it('shows the syncing APY headline when rate is null', () => {
    setup({ rate: null })
    expect(screen.getByText('Estimating vault APY…')).toBeInTheDocument()
  })

  it('shows the no-yield APY headline when the pool currently pays no yield', () => {
    setup({ rate: { rate: 1_000_000n, apyBps: 0n, fetchedAt: 0 } })
    expect(screen.getByText('Vault currently pays no yield')).toBeInTheDocument()
  })

  it('renders the APY percentage headline when apyBps is populated', () => {
    setup({ rate: { rate: 1_000_000n, apyBps: 450n, fetchedAt: 0 } })
    expect(screen.getByText('Earn ~4.50% APY')).toBeInTheDocument()
  })

  it('disables Review when amount exceeds maxInput', () => {
    setup({ max: 1_000_000n, amountStr: '5' })
    // The incomplete CTA keeps its DOM click (for the nudge) but is aria-disabled.
    expect(screen.getByRole('button', { name: /Review|Input amount/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('You can add up to 1 USDC — the fee is added on top')
  })

  it('shows the withdraw-specific over-max error when tab=withdraw', () => {
    setup({ tab: 'withdraw', max: 1_000_000n, amountStr: '5' })
    // A withdrawal's fee is taken from the proceeds, so the limit stands alone.
    expect(screen.getByRole('alert')).toHaveTextContent(/^You can withdraw up to 1 USDC$/)
  })

  it.each(['0.', '0.00'])('keeps Review disabled for a zero amount ("%s") (#112)', (amountStr) => {
    // WHY: "0." parses to 0; a zero-value vault deposit is a zero-value unshield, which the pool rejects.
    setup({ max: 5_000_000n, amountStr })
    expect(screen.getByRole('button', { name: 'Input amount' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('enables Review when amount is positive and within maxInput', () => {
    setup({ max: 5_000_000n, amountStr: '3' })
    expect(screen.getByRole('button', { name: /Review/ })).not.toBeDisabled()
  })

  it('fires onTabChange when a tab is clicked', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Withdraw' }))
    expect(props.onTabChange).toHaveBeenCalledWith('withdraw')
  })

  it('disables Review and surfaces the reason in the amount-field tooltip when continueBlockedReason is set', () => {
    // WHY: the withdraw fee is skimmed from the redeemed proceeds, so the modal gates submit when the
    // withdrawal amount doesn't exceed its own fee (a redeem can't pay a fee larger than its proceeds).
    render(
      <EarnInputStep
        tab="withdraw"
        onTabChange={vi.fn()}
        amountStr="0.4"
        onAmountChange={vi.fn()}
        max={5_000_000n}
        maxInput={5_000_000n}
        displayFees={ZERO_FEES}
        feeLoading={false}
        gasChainId={31337}
        rate={null}
        continueBlockedReason="Withdrawal is smaller than the 0.50 fee — withdraw more"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Review|Input amount/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/smaller than the 0\.50 fee/)
  })

  it('tapping the disabled "Input amount" CTA nudges the field (focus) instead of continuing', () => {
    const props = setup({ tab: 'add', amountStr: '' })
    const cta = screen.getByRole('button', { name: 'Input amount' })
    fireEvent.click(cta)
    expect(props.onContinue).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Shielded vault deposit amount')).toHaveFocus()
  })
})
