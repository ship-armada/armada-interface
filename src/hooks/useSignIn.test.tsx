// ABOUTME: Tests for useSignIn — the dashboard card's inline sign-in: one shared attempt (submitting / error), the lock reason
// ABOUTME: cleared and a queued flow opened on success, and an unsupported wallet sent to the restore modal's compatibility screen.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { NonDeterministicSignerError } from '@/lib/crypto/determinism'
import { lockReasonAtom, openModalAtom, restoreEntryAtom, signInResumeAtom, signInStatusAtom } from '@/state/ui'

const mockSignIn = vi.fn()
vi.mock('@/hooks/useShieldedWallet', () => ({ useShieldedWallet: () => ({ signIn: mockSignIn }) }))

import { useSignIn } from './useSignIn'

function setup() {
  const store = createStore()
  store.set(lockReasonAtom, 'idle')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const { result } = renderHook(() => useSignIn(), { wrapper })
  return { store, result }
}

beforeEach(() => mockSignIn.mockReset())

describe('useSignIn', () => {
  it('signs in, clears the lock reason, and opens nothing when no flow is queued', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const { store, result } = setup()
    await act(() => result.current.start())
    expect(mockSignIn).toHaveBeenCalledTimes(1)
    expect(store.get(lockReasonAtom)).toBeNull()
    expect(store.get(openModalAtom)).toBeNull()
    expect(store.get(signInStatusAtom)).toEqual({ submitting: false, error: null })
  })

  it('reports submitting while the wallet prompt is open, and ignores a second start meanwhile', async () => {
    let finish: () => void = () => {}
    mockSignIn.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const { store, result } = setup()
    let first: Promise<void> = Promise.resolve()
    act(() => { first = result.current.start() })
    expect(result.current.submitting).toBe(true)
    await act(() => result.current.start())
    expect(mockSignIn).toHaveBeenCalledTimes(1)
    await act(async () => { finish(); await first })
    expect(store.get(signInStatusAtom).submitting).toBe(false)
  })

  it('continues into the flow queued while locked', async () => {
    mockSignIn.mockResolvedValueOnce(undefined)
    const { store, result } = setup()
    store.set(signInResumeAtom, 'shield')
    await act(() => result.current.start())
    expect(store.get(openModalAtom)).toBe('shield')
    expect(store.get(signInResumeAtom)).toBeNull()
  })

  it('a declined or failed signature shows its message and keeps the lock reason', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('User rejected the request.'))
    const { store, result } = setup()
    await act(() => result.current.start())
    expect(result.current.error).toMatch(/declined|rejected/i)
    expect(store.get(lockReasonAtom)).toBe('idle')
  })

  it('an unsupported wallet opens the restore modal on the compatibility screen', async () => {
    mockSignIn.mockRejectedValueOnce(new NonDeterministicSignerError('first-sign-mismatch'))
    const { store, result } = setup()
    await act(() => result.current.start())
    expect(store.get(openModalAtom)).toBe('restore')
    expect(store.get(restoreEntryAtom)).toEqual({ view: 'signer-error', reason: 'first-sign-mismatch' })
    expect(result.current.error).toBeNull()
  })
})
