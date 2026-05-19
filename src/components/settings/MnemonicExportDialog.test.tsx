// ABOUTME: Tests for MnemonicExportDialog — passphrase gate, submit surfaces stub failure, Cancel close.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MnemonicExportDialog } from './MnemonicExportDialog'
import { activeRailgunWalletIdAtom, shieldedWalletsAtom } from '@/state/wallet'

function renderDialog() {
  const store = createStore()
  store.set(shieldedWalletsAtom, {
    'rg-1': { id: 'rg-1', status: 'unlocked', railgunAddress: '0zk-test' },
  })
  store.set(activeRailgunWalletIdAtom, 'rg-1')
  const onClose = vi.fn()
  render(
    <Provider store={store}>
      <MnemonicExportDialog open onClose={onClose} />
    </Provider>,
  )
  return { onClose }
}

describe('<MnemonicExportDialog>', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the passphrase gate first', () => {
    renderDialog()
    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reveal/ })).toBeDisabled()
  })

  it('enables Reveal once a passphrase is entered', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'something' } })
    expect(screen.getByRole('button', { name: /Reveal/ })).not.toBeDisabled()
  })

  it('Cancel calls onClose', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces the stub failure when Reveal is submitted', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'something' } })
    fireEvent.click(screen.getByRole('button', { name: /Reveal/ }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not implemented/)
    })
  })
})
