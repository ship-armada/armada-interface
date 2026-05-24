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

  describe('keystroke sanitizer', () => {
    // The sanitizer is the first line of defence against invalid input. parseUsdcInput's
    // categorised errors are the safety net for paths the sanitizer can't catch (programmatic
    // state writes, edge-case pastes). These tests cover the sanitizer surface; the parser
    // surface is tested separately in lib/format.test.ts.

    it('strips letters and symbols silently — the offending key never updates state', () => {
      const onValueChange = vi.fn()
      render(<AmountInput value="" onValueChange={onValueChange} label="Amount" variant="display" />)
      // Typing "abc12d" → sanitizer keeps only the digits.
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: 'abc12d' } })
      expect(onValueChange).toHaveBeenCalledWith('12')
    })

    it('rejects a second decimal point (no-op state update)', () => {
      const onValueChange = vi.fn()
      // Starting from "1.5", typing another "." should not register.
      render(<AmountInput value="1.5" onValueChange={onValueChange} label="Amount" variant="display" />)
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1.5.' } })
      // The second dot is stripped; result equals the previous value, so onValueChange isn't called.
      expect(onValueChange).not.toHaveBeenCalled()
    })

    it('caps the fractional portion at 6 chars on paste', () => {
      const onValueChange = vi.fn()
      render(<AmountInput value="" onValueChange={onValueChange} label="Amount" variant="display" />)
      // Pasting "1.123456789" gets truncated to "1.123456" (USDC precision).
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1.123456789' } })
      expect(onValueChange).toHaveBeenCalledWith('1.123456')
    })

    it('rejects a 7th decimal keystroke (state stays at the 6-decimal value)', () => {
      const onValueChange = vi.fn()
      render(<AmountInput value="1.123456" onValueChange={onValueChange} label="Amount" variant="display" />)
      // Typing one more digit at the end → sanitizer truncates to the existing value → no-op.
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1.1234567' } })
      expect(onValueChange).not.toHaveBeenCalled()
    })

    it('allows transitional states like "0." and "1." so the user can type forward', () => {
      const onValueChange = vi.fn()
      render(<AmountInput value="" onValueChange={onValueChange} label="Amount" variant="display" />)
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1.' } })
      expect(onValueChange).toHaveBeenCalledWith('1.')
    })

    it('strips formatting characters from pasted amounts (e.g. "$1,500.50" → "1500.50")', () => {
      const onValueChange = vi.fn()
      render(<AmountInput value="" onValueChange={onValueChange} label="Amount" variant="display" />)
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '$1,500.50' } })
      expect(onValueChange).toHaveBeenCalledWith('1500.50')
    })

    it('renders the "USDC has up to 6 decimal places" helper text on the display variant', () => {
      render(<AmountInput value="" onValueChange={() => {}} variant="display" label="Amount" />)
      expect(screen.getByText(/6 decimal places/i)).toBeInTheDocument()
    })
  })
})
