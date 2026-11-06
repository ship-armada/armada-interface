// ABOUTME: Tests for RestoreFlow — restore by backup file / pasted recovery secret, and the compatibility screen for a wallet
// ABOUTME: that can't use sign-in. useShieldedWallet + wagmi are mocked at the import boundary (no live engine / provider tree).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'

const mockUnlockByPaste = vi.fn()
const mockUnlockByBackup = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('@/hooks/useShieldedWallet', () => ({
  useShieldedWallet: () => ({ unlockByPaste: mockUnlockByPaste, unlockByBackup: mockUnlockByBackup }),
}))

vi.mock('wagmi', () => ({
  useDisconnect: () => ({ disconnect: mockDisconnect }),
}))

import { RestoreFlow } from './RestoreFlow'

function renderWith(opts?: { initialView?: 'restore' | 'signer-error' }) {
  const onUnlocked = vi.fn()
  const onClose = vi.fn()
  render(
    <Provider store={createStore()}>
      <RestoreFlow initialView={opts?.initialView} onUnlocked={onUnlocked} onClose={onClose} />
    </Provider>,
  )
  return { onUnlocked, onClose }
}

beforeEach(() => {
  mockUnlockByPaste.mockReset()
  mockUnlockByBackup.mockReset()
  mockDisconnect.mockReset()
})

describe('<RestoreFlow> — signer incompatible', () => {
  it('"Use a backup file or recovery secret" lands on the restore view with a banner', () => {
    renderWith({ initialView: 'signer-error' })
    fireEvent.click(screen.getByRole('button', { name: 'Use a backup file or recovery secret' }))
    expect(screen.getByRole('region', { name: 'Restore your account' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/encrypted backup file/i)
    expect(screen.getByLabelText('Backup file')).toBeInTheDocument()
  })

  it('"Try a different wallet" disconnects and goes back to the sign-in card', () => {
    const { onClose } = renderWith({ initialView: 'signer-error' })
    fireEvent.click(screen.getByRole('button', { name: 'Try a different wallet' }))
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('<RestoreFlow> — restore', () => {
  it('opens on the backup form', () => {
    renderWith()
    expect(screen.getByRole('region', { name: 'Restore your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Backup file')).toBeInTheDocument()
    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument()
  })

  it('disables Restore until a file + ≥8-char passphrase are provided, then calls unlockByBackup', async () => {
    const { onUnlocked } = renderWith()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
    mockUnlockByBackup.mockResolvedValueOnce(undefined)
    const file = new File(['{}'], 'wallet.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'pw-here-now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(mockUnlockByBackup).toHaveBeenCalledTimes(1))
    expect(mockUnlockByBackup.mock.calls[0]?.[0]).toBe(file)
    expect(mockUnlockByBackup.mock.calls[0]?.[1]).toBe('pw-here-now')
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })

  it('toggles to paste-secret and calls unlockByPaste', async () => {
    const { onUnlocked } = renderWith()
    fireEvent.click(screen.getByRole('button', { name: 'Paste a recovery secret instead' }))
    mockUnlockByPaste.mockResolvedValueOnce(undefined)
    const hex = 'a'.repeat(64)
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: hex } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(mockUnlockByPaste).toHaveBeenCalledWith(hex))
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })

  it('"Back to sign in" goes back to the sign-in card', () => {
    const { onClose } = renderWith()
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
