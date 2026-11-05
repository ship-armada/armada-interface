// ABOUTME: Tests for HighFeeNotice — Review's warning when fees are a large share of the amount: the percentage, and over
// ABOUTME: 25% an "I understand" tick the Review step waits for before Confirm.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HighFeeNotice } from './HighFeeNotice'

describe('<HighFeeNotice>', () => {
  it('a caution: says what share of the amount the fees are, with no tick', () => {
    render(<HighFeeNotice level="caution" percent={18} acknowledged={false} onAcknowledge={vi.fn()} />)
    expect(screen.getByRole('note', { name: 'High fees for this amount' })).toHaveTextContent('Fees are 18% of this amount.')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('over the confirm threshold: asks the user to acknowledge', () => {
    const onAcknowledge = vi.fn()
    render(<HighFeeNotice level="confirm" percent={40} acknowledged={false} onAcknowledge={onAcknowledge} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand the fees are more than a quarter of this amount' }))
    expect(onAcknowledge).toHaveBeenCalledWith(true)
  })

  it('renders nothing below the caution threshold', () => {
    const { container } = render(<HighFeeNotice level="none" percent={5} acknowledged={false} onAcknowledge={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
