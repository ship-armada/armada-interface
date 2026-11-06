// ABOUTME: Tests for RestoreModal — opened over the dashboard on the restore form or the compatibility screen; a restore
// ABOUTME: closes it onto the dashboard or the queued flow, clearing the lock reason; "Back to sign in" closes it.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { lockReasonAtom, openModalAtom, restoreEntryAtom, signInResumeAtom, type RestoreEntry } from '@/state/ui'

const mockUnlockByPaste = vi.fn()
vi.mock('@/hooks/useShieldedWallet', () => ({
  useShieldedWallet: () => ({ unlockByPaste: mockUnlockByPaste, unlockByBackup: vi.fn() }),
}))
vi.mock('wagmi', () => ({ useDisconnect: () => ({ disconnect: vi.fn() }) }))

import { RestoreModal } from './RestoreModal'

function renderModal(opts: { resume?: 'shield' | null; entry?: RestoreEntry } = {}) {
  const store = createStore()
  store.set(openModalAtom, 'restore')
  store.set(restoreEntryAtom, opts.entry ?? { view: 'restore' })
  store.set(signInResumeAtom, opts.resume ?? null)
  store.set(lockReasonAtom, 'idle')
  render(<Provider store={store}><RestoreModal /></Provider>)
  return store
}

async function restoreByPaste() {
  fireEvent.click(screen.getByRole('button', { name: 'Paste a recovery secret instead' }))
  fireEvent.change(screen.getByLabelText(/Recovery secret/), { target: { value: 'a'.repeat(64) } })
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
  await waitFor(() => expect(mockUnlockByPaste).toHaveBeenCalledTimes(1))
}

beforeEach(() => mockUnlockByPaste.mockReset())

describe('<RestoreModal>', () => {
  it('renders nothing unless the restore modal is open', () => {
    render(<Provider store={createStore()}><RestoreModal /></Provider>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens titled "Restore wallet" on the restore form', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Restore wallet' })).toBeInTheDocument()
    expect(screen.getByLabelText('Backup file')).toBeInTheDocument()
  })

  it('opens on the compatibility screen after sign-in failed the determinism check', () => {
    renderModal({ entry: { view: 'signer-error', reason: 'first-sign-mismatch' } })
    expect(screen.getByRole('button', { name: 'Use a backup file or recovery secret' })).toBeInTheDocument()
  })

  it('restored, it closes onto the dashboard and clears the lock reason', async () => {
    mockUnlockByPaste.mockResolvedValueOnce(undefined)
    const store = renderModal()
    await restoreByPaste()
    await waitFor(() => expect(store.get(openModalAtom)).toBeNull())
    expect(store.get(lockReasonAtom)).toBeNull()
  })

  it('restored with a flow queued while locked, it continues into that flow', async () => {
    mockUnlockByPaste.mockResolvedValueOnce(undefined)
    const store = renderModal({ resume: 'shield' })
    await restoreByPaste()
    await waitFor(() => expect(store.get(openModalAtom)).toBe('shield'))
    expect(store.get(signInResumeAtom)).toBeNull()
  })

  it('"Back to sign in" closes it, and the next open starts on the restore form', async () => {
    const store = renderModal({ entry: { view: 'signer-error', reason: 'first-sign-mismatch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use a backup file or recovery secret' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    await waitFor(() => expect(store.get(openModalAtom)).toBeNull())
    expect(store.get(restoreEntryAtom)).toEqual({ view: 'restore' })
  })
})
