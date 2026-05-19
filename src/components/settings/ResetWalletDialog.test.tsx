// ABOUTME: Tests for ResetWalletDialog — typed-confirmation gate, Cancel close, surface stub error.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ResetWalletDialog } from './ResetWalletDialog'
import { activeRailgunWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'

function renderDialog() {
  const store = createStore()
  // Seed an active wallet so reset() actually calls into the lib stub.
  store.set(shieldedWalletsAtom, {
    'rg-1': { id: 'rg-1', status: 'unlocked', railgunAddress: '0zk-test' },
  })
  store.set(activeRailgunWalletIdAtom, 'rg-1')
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <ResetWalletDialog open onClose={onClose} />
    </Provider>,
  )
  return { onClose, store }
}

describe('<ResetWalletDialog>', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("disables Reset until the user types the magic word", () => {
    renderDialog()
    const btn = screen.getByRole('button', { name: /^Reset wallet/ })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'not-it' } })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'reset' } })
    expect(btn).not.toBeDisabled()
  })

  it('Cancel calls onClose', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces the stub failure as an inline error', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'reset' } })
    fireEvent.click(screen.getByRole('button', { name: /^Reset wallet/ }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not implemented/)
    })
  })
})
