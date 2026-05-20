// ABOUTME: Tests for UnlockFlow — two modes (paste / backup) wired to useShieldedWallet.
// ABOUTME: Hook is mocked at the import boundary so we don't need wagmi config or a live engine.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { UnlockFlow } from './UnlockFlow'

const mockUnlockByPaste = vi.fn()
const mockUnlockByBackup = vi.fn()

vi.mock('@/hooks/useShieldedWallet', () => ({
  useShieldedWallet: () => ({
    unlockByPaste: mockUnlockByPaste,
    unlockByBackup: mockUnlockByBackup,
    // remaining surface is not exercised by UnlockFlow but must exist so the destructure compiles
    state: null,
    enroll: vi.fn(),
    lock: vi.fn(),
    reset: vi.fn(),
    exportBackup: vi.fn(),
  }),
}))

function renderWith() {
  const store = createStore()
  const onUnlocked = vi.fn()
  render(
    <Provider store={store}>
      <UnlockFlow onUnlocked={onUnlocked} />
    </Provider>,
  )
  return { onUnlocked }
}

beforeEach(() => {
  mockUnlockByPaste.mockReset()
  mockUnlockByBackup.mockReset()
})

describe('<UnlockFlow> — backup mode (default)', () => {
  it('renders the dialog with Backup file selected and Paste secret available', () => {
    renderWith()
    expect(screen.getByRole('dialog', { name: 'Unlock your account' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Backup file' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Paste secret' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Sign again' })).not.toBeInTheDocument()
  })

  it('disables Unlock until both a file and a passphrase are provided', () => {
    renderWith()
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeDisabled()

    const file = new File(['{}'], 'armada-backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } })
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeDisabled() // still no passphrase

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'pw-here-ok' } })
    expect(screen.getByRole('button', { name: /Unlock/ })).not.toBeDisabled()
  })

  it('calls unlockByBackup with (file, passphrase) on submit', async () => {
    const { onUnlocked } = renderWith()
    mockUnlockByBackup.mockResolvedValueOnce(undefined)

    const file = new File(['{}'], 'armada-backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'passphrase-here' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))

    await waitFor(() => {
      expect(mockUnlockByBackup).toHaveBeenCalledTimes(1)
      const args = mockUnlockByBackup.mock.calls[0]!
      expect(args[0]).toBeInstanceOf(File)
      expect(args[1]).toBe('passphrase-here')
    })
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })
})

describe('<UnlockFlow> — paste mode', () => {
  it('disables Unlock until a value is pasted', () => {
    renderWith()
    fireEvent.click(screen.getByRole('tab', { name: 'Paste secret' }))
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'ab'.repeat(32) } })
    expect(screen.getByRole('button', { name: /Unlock/ })).not.toBeDisabled()
  })

  it('calls unlockByPaste with the hex value and fires onUnlocked on success', async () => {
    const { onUnlocked } = renderWith()
    mockUnlockByPaste.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('tab', { name: 'Paste secret' }))
    const hex = 'ab'.repeat(32)
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: hex } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    await waitFor(() => expect(mockUnlockByPaste).toHaveBeenCalledWith(hex))
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })

  it('surfaces the lib error inline and does not advance', async () => {
    const { onUnlocked } = renderWith()
    mockUnlockByPaste.mockRejectedValueOnce(new Error('Recovery secret must be 64 hexadecimal characters (32 bytes).'))
    fireEvent.click(screen.getByRole('tab', { name: 'Paste secret' }))
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'not hex' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/64 hexadecimal/))
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})

describe('<UnlockFlow> — mode switching', () => {
  it('clears in-progress paste value when switching tabs', () => {
    renderWith()
    fireEvent.click(screen.getByRole('tab', { name: 'Paste secret' }))
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'ab'.repeat(32) } })
    fireEvent.click(screen.getByRole('tab', { name: 'Backup file' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Paste secret' }))
    expect(screen.getByLabelText(/Recovery secret/)).toHaveValue('')
  })
})
