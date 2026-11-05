// ABOUTME: Tests for TxTimingNote — the progress view's line under the stepper: "Usually takes ~N", an amber (not error)
// ABOUTME: "Taking longer than usual", and the safe-in-transit reassurance; nothing when there's no note.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TxTimingNote } from './TxTimingNote'

describe('<TxTimingNote>', () => {
  it('shows the usual-time hint, politely announced', () => {
    render(<TxTimingNote note={{ hint: 'Usually takes ~15 sec', slow: false, reassurance: null }} />)
    const note = screen.getByText('Usually takes ~15 sec').closest('[aria-live]')
    expect(note).toHaveAttribute('aria-live', 'polite')
    expect(note).toHaveAttribute('data-slow', 'false')
  })

  it('marks a slow stage (amber styling hook) and shows the reassurance', () => {
    render(<TxTimingNote note={{ hint: 'Taking longer than usual', slow: true, reassurance: 'Your USDC is safe in transit.' }} />)
    expect(screen.getByText('Taking longer than usual').closest('[aria-live]')).toHaveAttribute('data-slow', 'true')
    expect(screen.getByText('Your USDC is safe in transit.')).toBeInTheDocument()
  })

  it('renders nothing without a note', () => {
    const { container } = render(<TxTimingNote note={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
