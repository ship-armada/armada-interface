// ABOUTME: Tests for ConfirmMnemonicStep — 3-word challenge at positions 3/7/11, validates input, gates Continue.
// ABOUTME: Trim + lowercase normalization is exercised by passing extra whitespace and mixed case.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmMnemonicStep } from './ConfirmMnemonicStep'

const TWELVE_WORDS =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'
// 1: abandon, 3: able, 7: absorb, 11: access

function setup() {
  const onConfirmed = vi.fn()
  const onBack = vi.fn()
  render(
    <ConfirmMnemonicStep
      mnemonic={TWELVE_WORDS}
      onBack={onBack}
      onConfirmed={onConfirmed}
    />,
  )
  return { onConfirmed, onBack }
}

describe('<ConfirmMnemonicStep>', () => {
  it('challenges the user on word positions 3, 7, and 11', () => {
    setup()
    expect(screen.getByLabelText('Word #3')).toBeInTheDocument()
    expect(screen.getByLabelText('Word #7')).toBeInTheDocument()
    expect(screen.getByLabelText('Word #11')).toBeInTheDocument()
  })

  it('disables Continue until all three inputs have content', () => {
    setup()
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Word #3'), { target: { value: 'able' } })
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Word #7'), { target: { value: 'absorb' } })
    fireEvent.change(screen.getByLabelText('Word #11'), { target: { value: 'access' } })
    expect(screen.getByRole('button', { name: /Continue/ })).not.toBeDisabled()
  })

  it("shows an error and stays put when words don't match", () => {
    const { onConfirmed } = setup()
    fireEvent.change(screen.getByLabelText('Word #3'), { target: { value: 'wrong' } })
    fireEvent.change(screen.getByLabelText('Word #7'), { target: { value: 'absorb' } })
    fireEvent.change(screen.getByLabelText('Word #11'), { target: { value: 'access' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(screen.getByRole('alert')).toHaveTextContent("don't match")
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('fires onConfirmed when all three words match (case + whitespace tolerant)', () => {
    const { onConfirmed } = setup()
    fireEvent.change(screen.getByLabelText('Word #3'), { target: { value: 'Able' } })
    fireEvent.change(screen.getByLabelText('Word #7'), { target: { value: '  absorb  ' } })
    fireEvent.change(screen.getByLabelText('Word #11'), { target: { value: 'ACCESS' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('fires onBack when the secondary CTA is clicked', () => {
    const { onBack } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
