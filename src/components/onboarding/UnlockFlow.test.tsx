// ABOUTME: Tests for UnlockFlow — passphrase entry, submit invokes useShieldedWallet.unlock with (walletId, passphrase), failure surfaces inline.
// ABOUTME: Stub unlockWallet throws "not implemented" — the test verifies the error message reaches the alert region.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { UnlockFlow } from './UnlockFlow'

function renderWith() {
  const store = createStore()
  const onUnlocked = vi.fn()
  render(
    <Provider store={store}>
      <UnlockFlow walletId="rg-1" onUnlocked={onUnlocked} />
    </Provider>,
  )
  return { onUnlocked }
}

describe('<UnlockFlow>', () => {
  it('renders the unlock title and a passphrase field', () => {
    renderWith()
    expect(screen.getByRole('dialog', { name: 'Unlock your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument()
  })

  it('disables the Unlock button when the field is empty', () => {
    renderWith()
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeDisabled()
  })

  it('enables Unlock once a passphrase is entered', () => {
    renderWith()
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'anything' } })
    expect(screen.getByRole('button', { name: /Unlock/ })).not.toBeDisabled()
  })

  it('surfaces the stub failure as an inline error', async () => {
    const { onUnlocked } = renderWith()
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    // Stub throws; alert appears with the "not implemented" message.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/not implemented/),
    )
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})
