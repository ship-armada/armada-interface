// ABOUTME: Tests for SignInModal — the app's sign-in, opened over the dashboard: it signs in, then closes onto the dashboard
// ABOUTME: or continues into the flow that was tapped while locked, clearing the lock reason; closing drops the queued flow.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { lockReasonAtom, openModalAtom, signInResumeAtom } from '@/state/ui'

const mockSignIn = vi.fn()
vi.mock('@/hooks/useShieldedWallet', () => ({
  useShieldedWallet: () => ({ signIn: mockSignIn, unlockByPaste: vi.fn(), unlockByBackup: vi.fn() }),
}))
vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: true, address: '0xabcd1234' }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
}))
vi.mock('@rainbow-me/rainbowkit', () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }))

import { SignInModal } from './SignInModal'

function renderModal(opts: { resume?: 'shield' | null } = {}) {
  const store = createStore()
  store.set(openModalAtom, 'sign-in')
  store.set(signInResumeAtom, opts.resume ?? null)
  store.set(lockReasonAtom, 'idle')
  render(<Provider store={store}><SignInModal /></Provider>)
  return store
}

beforeEach(() => mockSignIn.mockReset())

describe('<SignInModal>', () => {
  it('renders nothing unless the sign-in modal is open', () => {
    const store = createStore()
    render(<Provider store={store}><SignInModal /></Provider>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens titled "Sign in" and asks for the signature straight away', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1))
  })

  it('signed in, it closes onto the dashboard and clears the lock reason', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const store = renderModal()
    await waitFor(() => expect(store.get(openModalAtom)).toBeNull())
    expect(store.get(lockReasonAtom)).toBeNull()
  })

  it('signed in after tapping an action while locked, it continues into that flow', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const store = renderModal({ resume: 'shield' })
    await waitFor(() => expect(store.get(openModalAtom)).toBe('shield'))
    expect(store.get(signInResumeAtom)).toBeNull()
  })

  it('closing it drops the queued flow — even if the wallet then completes the signature', async () => {
    let finishSigning: () => void = () => {}
    mockSignIn.mockReturnValueOnce(new Promise<void>((resolve) => { finishSigning = resolve }))
    const store = renderModal({ resume: 'shield' })
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(store.get(openModalAtom)).toBeNull())
    expect(store.get(signInResumeAtom)).toBeNull()
    // The user signs in the wallet after closing: they're signed in, but no flow opens over the dashboard.
    finishSigning()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.get(openModalAtom)).toBeNull()
  })
})
