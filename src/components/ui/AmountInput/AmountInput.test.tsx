// ABOUTME: Tests for AmountInput — controlled value, MAX shortcut, AVAILABLE caption, error rendering, both variants.
// ABOUTME: MAX click writes the locale-free decimal string (formatUsdcPlain) into the input, matching downstream parseUsdcInput expectations.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AmountInput } from './AmountInput'

describe('<AmountInput>', () => {
  it('renders the label when provided', () => {
    render(<AmountInput value="" onValueChange={() => {}} label="Amount" />)
    expect(screen.getByText('Amount')).toBeInTheDocument()
  })

  it('renders the current value as controlled input', () => {
    render(<AmountInput value="42.5" onValueChange={() => {}} label="Amount" />)
    expect(screen.getByDisplayValue('42.5')).toBeInTheDocument()
  })

  it('fires onValueChange when the user types', () => {
    const onValueChange = vi.fn()
    render(<AmountInput value="" onValueChange={onValueChange} label="Amount" />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.34' } })
    expect(onValueChange).toHaveBeenCalledWith('12.34')
  })

  it('shows AVAILABLE caption when max is supplied (compact variant)', () => {
    render(<AmountInput value="" onValueChange={() => {}} max={5_000_000n} variant="compact" />)
    expect(screen.getByText(/Available 5\.00 USDC/i)).toBeInTheDocument()
  })

  it('shows AVAILABLE caption when max is supplied (display variant)', () => {
    render(<AmountInput value="" onValueChange={() => {}} max={5_000_000n} variant="display" />)
    expect(screen.getByText('AVAILABLE 5.00')).toBeInTheDocument()
  })

  it('writes the max value as a plain decimal string on MAX click', () => {
    const onValueChange = vi.fn()
    render(<AmountInput value="" onValueChange={onValueChange} max={5_500_000n} />)
    fireEvent.click(screen.getByRole('button', { name: /MAX/ }))
    expect(onValueChange).toHaveBeenCalledWith('5.5')
  })

  it('omits MAX button when max is undefined', () => {
    render(<AmountInput value="" onValueChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /MAX/ })).toBeNull()
  })

  it('renders an error message when error prop is set', () => {
    render(<AmountInput value="" onValueChange={() => {}} error="Insufficient balance" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance')
  })

  it('disables the MAX button when disabled', () => {
    render(<AmountInput value="" onValueChange={() => {}} max={1_000_000n} disabled />)
    expect(screen.getByRole('button', { name: /MAX/ })).toBeDisabled()
  })

  it('renders the unit suffix only in the display variant', () => {
    const { rerender } = render(
      <AmountInput value="1" onValueChange={() => {}} variant="display" unit="USDC" />,
    )
    expect(screen.getByText('USDC')).toBeInTheDocument()
    rerender(<AmountInput value="1" onValueChange={() => {}} variant="compact" unit="USDC" />)
    expect(screen.queryByText('USDC')).toBeNull()
  })
})
