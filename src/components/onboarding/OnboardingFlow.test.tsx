// ABOUTME: Tests for OnboardingFlow — walks the user through all 5 steps end-to-end with a deterministic mnemonic.
// ABOUTME: We can't stub generateMnemonic from a public surface; instead, we read the mnemonic words off the rendered MnemonicStep DOM and use them to fill ConfirmMnemonicStep.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { OnboardingFlow } from './OnboardingFlow'

function renderFlow() {
  const store = createStore()
  const onDone = vi.fn()
  render(
    <Provider store={store}>
      <OnboardingFlow onDone={onDone} />
    </Provider>,
  )
  return { onDone }
}

function readWordAtPosition(pos1Based: number): string {
  // MnemonicStep renders an ordered list with one <li> per word; each <li> has the index span + word span.
  const list = screen.getByRole('list', { name: 'Recovery phrase' })
  const items = within(list).getAllByRole('listitem')
  const item = items[pos1Based - 1]
  if (!item) throw new Error(`No word at position ${pos1Based}`)
  // The word is the second child span; just read its textContent.
  // We can't easily get the second span by role; use the index marker to skip.
  const spans = item.querySelectorAll('span')
  const wordEl = spans[1]
  if (!wordEl) throw new Error(`Couldn't locate word span at position ${pos1Based}`)
  return wordEl.textContent ?? ''
}

describe('<OnboardingFlow>', () => {
  it('starts on the Welcome step', () => {
    renderFlow()
    expect(screen.getByRole('heading', { name: 'Create your private USDC account' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 5' })).toBeInTheDocument()
  })

  it('advances Welcome → Mnemonic on Create click', () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }))
    expect(screen.getByText('Save your recovery phrase')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 5' })).toBeInTheDocument()
  })

  it('advances Mnemonic → Confirm on "I\'ve saved it"', () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }))
    fireEvent.click(screen.getByRole('button', { name: /I've saved it/ }))
    expect(screen.getByText('Confirm your recovery phrase')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Step 3 of 5' })).toBeInTheDocument()
  })

  it('completes Confirm with the correct words and advances to Passphrase', () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }))
    // Capture the real words at positions 3/7/11 from the generated mnemonic.
    const w3 = readWordAtPosition(3)
    const w7 = readWordAtPosition(7)
    const w11 = readWordAtPosition(11)
    fireEvent.click(screen.getByRole('button', { name: /I've saved it/ }))
    fireEvent.change(screen.getByLabelText('Word #3'), { target: { value: w3 } })
    fireEvent.change(screen.getByLabelText('Word #7'), { target: { value: w7 } })
    fireEvent.change(screen.getByLabelText('Word #11'), { target: { value: w11 } })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(screen.getByText('Set a passphrase')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Step 4 of 5' })).toBeInTheDocument()
  })

  it('surfaces createWallet stub failure as a passphrase-step error', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }))
    const w3 = readWordAtPosition(3)
    const w7 = readWordAtPosition(7)
    const w11 = readWordAtPosition(11)
    fireEvent.click(screen.getByRole('button', { name: /I've saved it/ }))
    fireEvent.change(screen.getByLabelText('Word #3'), { target: { value: w3 } })
    fireEvent.change(screen.getByLabelText('Word #7'), { target: { value: w7 } })
    fireEvent.change(screen.getByLabelText('Word #11'), { target: { value: w11 } })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    // Stub throws; expect the inline error to appear.
    expect(await screen.findByRole('alert')).toHaveTextContent(/not implemented/)
  })
})
