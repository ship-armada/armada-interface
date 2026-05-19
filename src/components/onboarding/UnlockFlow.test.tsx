// ABOUTME: Tests for UnlockFlow — three modes (paste / backup / sign) wired to useShieldedWallet.
// ABOUTME: Hook is mocked at the import boundary so we don't need wagmi config or a live engine.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { UnlockFlow } from './UnlockFlow'

const mockUnlockByPaste = vi.fn()
const mockUnlockByBackup = vi.fn()
const mockEnroll = vi.fn()

vi.mock('@/hooks/useShieldedWallet', () => ({
  useShieldedWallet: () => ({
    unlockByPaste: mockUnlockByPaste,
    unlockByBackup: mockUnlockByBackup,
    enroll: mockEnroll,
    // remaining surface is not exercised by UnlockFlow but must exist so the destructure compiles
    state: null,
    lock: vi.fn(),
    reset: vi.fn(),
    exportBackup: vi.fn(),
    create: vi.fn(),
    unlock: vi.fn(),
    exportPhrase: vi.fn(),
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
  mockEnroll.mockReset()
})

describe('<UnlockFlow> — paste mode', () => {
  it('renders the dialog with all three unlock tabs', () => {
    renderWith()
    expect(screen.getByRole('dialog', { name: 'Unlock your account' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Paste secret' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Backup file' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sign again' })).toBeInTheDocument()
  })

  it('disables Unlock until a value is pasted', () => {
    renderWith()
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'ab'.repeat(32) } })
    expect(screen.getByRole('button', { name: /Unlock/ })).not.toBeDisabled()
  })

  it('calls unlockByPaste with the hex value and fires onUnlocked on success', async () => {
    const { onUnlocked } = renderWith()
    mockUnlockByPaste.mockResolvedValueOnce(undefined)
    const hex = 'ab'.repeat(32)
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: hex } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    await waitFor(() => expect(mockUnlockByPaste).toHaveBeenCalledWith(hex))
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })

  it('surfaces the lib error inline and does not advance', async () => {
    const { onUnlocked } = renderWith()
    mockUnlockByPaste.mockRejectedValueOnce(new Error('Recovery secret must be 64 hexadecimal characters (32 bytes).'))
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'not hex' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/64 hexadecimal/))
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})

describe('<UnlockFlow> — backup mode', () => {
  it('disables Unlock until both a file and a passphrase are provided', () => {
    renderWith()
    fireEvent.click(screen.getByRole('tab', { name: 'Backup file' }))
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
    fireEvent.click(screen.getByRole('tab', { name: 'Backup file' }))

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

describe('<UnlockFlow> — sign-again mode', () => {
  it('calls enroll() on click and fires onUnlocked on success', async () => {
    const { onUnlocked } = renderWith()
    mockEnroll.mockResolvedValueOnce({ rootSecret: new Uint8Array(32), state: { id: 'x' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Sign again' }))
    fireEvent.click(screen.getByRole('button', { name: /Sign to unlock/ }))
    await waitFor(() => expect(mockEnroll).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })

  it('surfaces an enroll failure inline (e.g. user rejected the signature)', async () => {
    const { onUnlocked } = renderWith()
    mockEnroll.mockRejectedValueOnce(new Error('User rejected the request.'))
    fireEvent.click(screen.getByRole('tab', { name: 'Sign again' }))
    fireEvent.click(screen.getByRole('button', { name: /Sign to unlock/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rejected/))
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})

describe('<UnlockFlow> — mode switching', () => {
  it('clears in-progress paste value when switching tabs', () => {
    renderWith()
    fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'ab'.repeat(32) } })
    fireEvent.click(screen.getByRole('tab', { name: 'Backup file' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Paste secret' }))
    expect(screen.getByLabelText(/Recovery secret/)).toHaveValue('')
  })
})
