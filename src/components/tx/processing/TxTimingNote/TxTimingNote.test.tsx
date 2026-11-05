// ABOUTME: Tests for TxTimingNote — the slow-stage callout under the stepper (warning style: amber edge + icon, not an
// ABOUTME: error): "Taking longer than usual" + a one-line body; nothing while the stage runs normally (that's the chip).

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TxTimingNote } from './TxTimingNote'

describe('<TxTimingNote>', () => {
  it('shows the slow callout, politely announced', () => {
    render(<TxTimingNote note={{ kind: 'slow', title: 'Taking longer than usual', body: 'Your USDC is safe in transit.' }} />)
    const callout = screen.getByRole('status')
    expect(callout).toHaveAttribute('aria-live', 'polite')
    expect(callout).toHaveTextContent('Taking longer than usual')
    expect(callout).toHaveTextContent('Your USDC is safe in transit.')
  })

  it('renders nothing for the normal "usually" state (the stepper shows that as a chip) or no note', () => {
    const { container, rerender } = render(<TxTimingNote note={{ kind: 'usual', chip: '~15 sec' }} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<TxTimingNote note={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
