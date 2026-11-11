// ABOUTME: Tests for ResetWalletDialog — the typed-confirmation gate, Cancel, and a failed reset shown inline with the dialog
// ABOUTME: kept open (useShieldedWallet is mocked so the outcome is deterministic).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ResetWalletDialog } from './ResetWalletDialog'
import { activeShieldedWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'

const reset = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useShieldedWallet', () => ({ useShieldedWallet: () => ({ reset }) }))

function renderDialog() {
  const store = createStore()
  // An unlocked active wallet, as when Settings opens the dialog.
  store.set(shieldedWalletsAtom, {
    'rg-1': { id: 'rg-1', status: 'unlocked', shieldedAddress: '0zk-test' },
  })
  store.set(activeShieldedWalletIdAtom, 'rg-1')
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
    reset.mockReset().mockResolvedValue(undefined)
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

  it('shows a failed reset inline and stays open, so the user knows nothing was deleted', async () => {
    reset.mockRejectedValue(new Error('IndexedDB is blocked'))
    const { onClose } = renderDialog()
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'reset' } })
    fireEvent.click(screen.getByRole('button', { name: /^Reset wallet/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('IndexedDB is blocked'))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes once the reset succeeds', async () => {
    const { onClose } = renderDialog()
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'reset' } })
    fireEvent.click(screen.getByRole('button', { name: /^Reset wallet/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
