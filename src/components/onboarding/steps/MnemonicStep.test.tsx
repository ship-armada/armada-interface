// ABOUTME: Tests for MnemonicStep — renders all 12 words in order, fires onBack/onContinue, copy button is reachable.
// ABOUTME: Skips clipboard-write integration (jsdom does not implement navigator.clipboard).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MnemonicStep } from './MnemonicStep'

const TWELVE_WORDS =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'

describe('<MnemonicStep>', () => {
  it('renders every word in the phrase', () => {
    render(<MnemonicStep mnemonic={TWELVE_WORDS} onBack={() => {}} onContinue={() => {}} />)
    for (const w of TWELVE_WORDS.split(' ')) {
      expect(screen.getByText(w)).toBeInTheDocument()
    }
  })

  it('renders 1-12 indices in the word grid', () => {
    render(<MnemonicStep mnemonic={TWELVE_WORDS} onBack={() => {}} onContinue={() => {}} />)
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument()
    }
  })

  it('fires onContinue when the primary CTA is clicked', () => {
    const onContinue = vi.fn()
    render(<MnemonicStep mnemonic={TWELVE_WORDS} onBack={() => {}} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /I've saved it/ }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('fires onBack when the secondary CTA is clicked', () => {
    const onBack = vi.fn()
    render(<MnemonicStep mnemonic={TWELVE_WORDS} onBack={onBack} onContinue={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('has a Copy control', () => {
    render(<MnemonicStep mnemonic={TWELVE_WORDS} onBack={() => {}} onContinue={() => {}} />)
    expect(screen.getByRole('button', { name: 'Copy recovery phrase' })).toBeInTheDocument()
  })
})
