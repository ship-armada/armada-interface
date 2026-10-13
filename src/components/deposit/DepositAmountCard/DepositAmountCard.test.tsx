// ABOUTME: Tests for DepositAmountCard — pending-balance suffix, amount typing, percent pills and the
// ABOUTME: amount roll (lifetime + colour), fee caption, and the incomplete-CTA nudge shake.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { incompleteCtaShakeClass } from '@/design'
import { formatUsdcPlain } from '@/lib/format'
import { DepositAmountCard } from './DepositAmountCard'

/** Timers the odometer uses: its two-frame kick-off (rAF) and its settle timer (setTimeout). */
const ROLL_TIMERS = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] as const

/** Temporarily report non-reduced motion (setup defaults to reduced) for the duration of `fn`. */
function withMotionEnabled(fn: () => void) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
  try {
    fn()
  } finally {
    window.matchMedia = original
  }
}

function renderCard(props: Partial<Parameters<typeof DepositAmountCard>[0]> = {}) {
  return render(
    <DepositAmountCard
      amount=""
      onAmountChange={() => {}}
      balance="12.00"
      {...props}
    />,
  )
}

describe('DepositAmountCard — pendingBalance', () => {
  it('renders a "· X pending" suffix on the balance row when pendingBalance is set', () => {
    renderCard({ pendingBalance: '4.00' })
    // The suffix lives in the same balance span, so match the combined text.
    expect(screen.getByText(/12\.00 · 4\.00 pending/)).toBeInTheDocument()
  })

  it('shows only the available balance (no pending suffix) when pendingBalance is omitted', () => {
    renderCard()
    expect(screen.getByText('12.00')).toBeInTheDocument()
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument()
  })
})

describe('DepositAmountCard — amount typing', () => {
  it('passes a leading 0 / . through instead of discarding it (sub-one amounts are typeable)', () => {
    // Regression: the card used to rewrite `0`/`.` to '' via hasActiveAmount, so a user could not
    // start typing "0.5" — the leading 0 or . vanished. Each keystroke must now commit forward.
    const onAmountChange = vi.fn()
    renderCard({ amount: '', onAmountChange, amountAriaLabel: 'Deposit amount' })
    const input = screen.getByLabelText('Deposit amount')
    fireEvent.change(input, { target: { value: '0' } })
    expect(onAmountChange).toHaveBeenLastCalledWith('0')
    fireEvent.change(input, { target: { value: '.' } })
    expect(onAmountChange).toHaveBeenLastCalledWith('.')
  })

  it('caps typed input at 6 decimals and collapses leading zeros', () => {
    const onAmountChange = vi.fn()
    renderCard({ amount: '', onAmountChange, amountAriaLabel: 'Deposit amount' })
    const input = screen.getByLabelText('Deposit amount')
    fireEvent.change(input, { target: { value: '1.1234567' } })
    expect(onAmountChange).toHaveBeenLastCalledWith('1.123456')
    fireEvent.change(input, { target: { value: '05' } })
    expect(onAmountChange).toHaveBeenLastCalledWith('5')
  })

  it('renders the amount with thousand grouping while storing it ungrouped', () => {
    // The input shows "1,000,000" but the sanitizer strips the commas on the next keystroke.
    const onAmountChange = vi.fn()
    renderCard({ amount: '1000000', onAmountChange, amountAriaLabel: 'Deposit amount' })
    expect(screen.getByLabelText('Deposit amount')).toHaveValue('1,000,000')
  })

  it('surfaces the amount error as an above-field alert (tooltip), not inline below', () => {
    renderCard({ amount: '5', error: "That's more than you can deposit" })
    expect(screen.getByRole('alert')).toHaveTextContent("That's more than you can deposit")
  })
})

describe('DepositAmountCard — presets + amount roll', () => {
  it('commits a fraction of maxInput when a percentage pill is clicked', () => {
    const onAmountChange = vi.fn()
    // 12 USDC cap → 25% is 3 USDC (integer bigint math, no float rounding).
    renderCard({ maxInput: 12_000000n, onAmountChange })
    fireEvent.click(screen.getByRole('button', { name: '25%' }))
    expect(onAmountChange).toHaveBeenCalledWith(formatUsdcPlain(3_000000n))
  })

  it('delegates Max to the caller-supplied onMax (fee-on-top cap) over the maxInput fraction', () => {
    const onMax = vi.fn()
    const onAmountChange = vi.fn()
    renderCard({ maxInput: 12_000000n, onMax, onAmountChange })
    fireEvent.click(screen.getByRole('button', { name: 'Max' }))
    expect(onMax).toHaveBeenCalledTimes(1)
    // onMax owns the amount update; the card does not also commit its own fraction.
    expect(onAmountChange).not.toHaveBeenCalled()
  })

  it('freezes the input into a roll while a preset lands (motion enabled)', () => {
    withMotionEnabled(() => {
      const onAmountChange = vi.fn()
      const { rerender } = render(
        <DepositAmountCard
          amount="1"
          onAmountChange={onAmountChange}
          maxInput={12_000000n}
          amountAriaLabel="Deposit amount"
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: '50%' }))
      // The parent commits the new amount → the roll effect starts on the prop change.
      rerender(
        <DepositAmountCard
          amount="6"
          onAmountChange={onAmountChange}
          maxInput={12_000000n}
          amountAriaLabel="Deposit amount"
        />,
      )
      // While the odometer plays, the underlying input is held read-only.
      expect(screen.getByLabelText('Deposit amount')).toHaveAttribute('readonly')
    })
  })

  it('does not roll under reduced motion — the amount updates without freezing the input', () => {
    const onAmountChange = vi.fn()
    const { rerender } = render(
      <DepositAmountCard
        amount="1"
        onAmountChange={onAmountChange}
        maxInput={12_000000n}
        amountAriaLabel="Deposit amount"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '50%' }))
    rerender(
      <DepositAmountCard
        amount="6"
        onAmountChange={onAmountChange}
        maxInput={12_000000n}
        amountAriaLabel="Deposit amount"
      />,
    )
    expect(screen.getByLabelText('Deposit amount')).not.toHaveAttribute('readonly')
  })
})

describe('DepositAmountCard — roll lifetime and colour', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Render at `from`, tap `pill`, then commit `to` as the parent would — starting the roll. */
  function rollFrom(from: string, to: string, pill: string, extra: { error?: string } = {}) {
    const onAmountChange = vi.fn()
    const props = { onAmountChange, maxInput: 20_000000n, amountAriaLabel: 'Deposit amount', ...extra }
    const { rerender, container } = render(<DepositAmountCard amount={from} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: pill }))
    rerender(<DepositAmountCard amount={to} {...props} />)
    return container
  }

  it('holds the input read-only until a padded roll has fully settled', () => {
    withMotionEnabled(() => {
      vi.useFakeTimers({ toFake: [...ROLL_TIMERS] })
      // 1.123456 → 10 rolls as the 8-column row "10.000000": it settles ~1.6s in, well after the
      // ~1.15s that the two digits of "10" alone would suggest.
      rollFrom('1.123456', '10', '50%')
      // The odometer's two-frame kick-off, in its own act() so its effects flush as in a browser.
      act(() => {
        vi.advanceTimersByTime(50)
      })
      act(() => {
        vi.advanceTimersByTime(1250)
      })
      expect(screen.getByLabelText('Deposit amount')).toHaveAttribute('readonly')
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(screen.getByLabelText('Deposit amount')).not.toHaveAttribute('readonly')
    })
  })

  it('reddens the rolling odometer when the amount has an error, matching the static value', () => {
    withMotionEnabled(() => {
      const container = rollFrom('1', '10', '50%', { error: "That's more than you can deposit" })
      const layer = container.querySelector('[class*="amountRollLayer"]')
      expect(layer?.className).toContain('amountRollError')
    })
  })

  it('dims the odometer when it rolls to the inactive 0, matching the placeholder it hands over to', () => {
    withMotionEnabled(() => {
      // No spendable balance: every pill lands on 0, which the card shows as the dim placeholder.
      const onAmountChange = vi.fn()
      const props = { onAmountChange, maxInput: 0n, amountAriaLabel: 'Deposit amount' }
      const { rerender, container } = render(<DepositAmountCard amount="5" {...props} />)
      fireEvent.click(screen.getByRole('button', { name: '25%' }))
      rerender(<DepositAmountCard amount="0" {...props} />)
      const layer = container.querySelector('[class*="amountRollLayer"]')
      expect(layer?.className).toContain('amountRollInactive')
    })
  })
})

describe('DepositAmountCard — fee caption', () => {
  const nativeGas = { wei: 1_234_560_000_000_000n, symbol: 'ETH', formatted: '0.00123456' }
  /** DisplayFees with the given USDC fee total + a native-gas estimate. */
  function fees(totalFee: bigint) {
    return { protocolFee: totalFee, gasFee: 0n, nativeGas, totalFee, feeInclusive: true }
  }

  it('promotes the ETH network-gas estimate into the caption on the direct path (userPaysNativeGas)', () => {
    // Direct hub shield: no USDC fee → the only cost is network gas. The gas segment shows ONLY
    // because the caller explicitly flags the direct path — never inferred from a zero fee.
    renderCard({ amount: '5', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 0n }, userPaysNativeGas: true })
    expect(screen.getByText('+ ~0.0012 ETH gas')).toBeInTheDocument()
    expect(screen.queryByText(/FEE/)).not.toBeInTheDocument()
  })

  it('hides the gas segment on relayer-mediated flows even when the fee is 0 (no userPaysNativeGas)', () => {
    // Regression: a spend whose fee hasn't loaded (broadcasterFee 0) must NOT surface an ETH gas
    // line. The explicit flag is off, so no gas segment — this is the #1 bug fix.
    renderCard({ amount: '5', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 0n } })
    expect(screen.queryByText(/ETH gas/)).not.toBeInTheDocument()
  })

  it('hides the gas segment on the gasless path (relayer covers gas, broadcasterFee > 0)', () => {
    renderCard({ amount: '5', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 250_000n } })
    expect(screen.queryByText(/ETH gas/)).not.toBeInTheDocument()
    // The relayer fee still surfaces as the USDC FEE segment.
    expect(screen.getByText('+ $0.25 FEE')).toBeInTheDocument()
  })

  it('shows BOTH the USDC fee and the ETH gas on a direct cross-chain shield', () => {
    // Direct path (userPaysNativeGas) + a CCTP fee deducted in USDC → both segments render.
    renderCard({ amount: '5', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 0n, cctpFee: 500_000n }, userPaysNativeGas: true })
    expect(screen.getByText('+ $0.50 FEE')).toBeInTheDocument()
    expect(screen.getByText('+ ~0.0012 ETH gas')).toBeInTheDocument()
  })

  it('a fee that comes out of the amount reads "incl.", not "+" — a shield charges nothing on top (F26, #83)', () => {
    // WHY: "+ $X FEE" says the fee is added to what the user typed; a shield takes it from the deposit (the pool
    // receives amount − fees). Network gas IS paid on top, from the wallet, so it keeps its "+".
    renderCard({ amount: '10', displayFees: fees(20_011n), flowBreakdown: { broadcasterFee: 1_000_003n, feesFromAmount: true }, userPaysNativeGas: true })
    expect(screen.getByText('incl. $1.020014 FEE')).toBeInTheDocument()
    expect(screen.getByText('+ ~0.0012 ETH gas')).toBeInTheDocument()
    expect(screen.queryByText(/\+ \$/)).not.toBeInTheDocument()
  })

  it('a vault withdrawal\'s fee, taken from its proceeds, reads "incl." too', () => {
    renderCard({ amount: '10', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 1_000_003n, feeFromProceeds: true } })
    expect(screen.getByText('incl. $1.000003 FEE')).toBeInTheDocument()
  })

  it('renders no caption segments before an amount is entered', () => {
    renderCard({ amount: '', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 0n }, userPaysNativeGas: true })
    expect(screen.queryByText(/ETH gas/)).not.toBeInTheDocument()
    expect(screen.queryByText(/FEE/)).not.toBeInTheDocument()
  })

  it('shows "Estimating fees…" and suppresses both segments while the fee path is resolving', () => {
    // feeResolving = the relayer-reachability probe is in flight; we don't yet know gasless vs direct.
    renderCard({ amount: '5', displayFees: fees(500_000n), flowBreakdown: { broadcasterFee: 0n }, feeResolving: true })
    expect(screen.getByText(/Estimating fees…/)).toBeInTheDocument()
    expect(screen.queryByText(/ETH gas/)).not.toBeInTheDocument()
    expect(screen.queryByText(/FEE/)).not.toBeInTheDocument()
  })

  it('shows the fee as "—" (no figure) when it can\'t be worked out', () => {
    // feeUnavailable = the send can't be priced (e.g. the planner refused it); the quote would mislead.
    renderCard({ amount: '5', displayFees: fees(0n), flowBreakdown: { broadcasterFee: 1_286_550n }, feeUnavailable: true })
    expect(screen.getByText('+ — FEE')).toBeInTheDocument()
    expect(screen.queryByText(/1\.28655/)).not.toBeInTheDocument()
  })
})

describe('DepositAmountCard — incomplete-CTA nudge shake', () => {
  // The mockup nudges by shaking the amount CARD (not the button) to point the eye at the empty
  // field; the modal drives this via the `shaking` prop when the disabled "Input amount" CTA is tapped.
  it('applies the shake class to the card root when shaking', () => {
    const { container } = renderCard({ shaking: true })
    expect((container.firstChild as HTMLElement).className).toContain(incompleteCtaShakeClass)
  })

  it('does not apply the shake class when not shaking', () => {
    const { container } = renderCard()
    expect((container.firstChild as HTMLElement).className).not.toContain(incompleteCtaShakeClass)
  })
})
