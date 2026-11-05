// ABOUTME: Tests for useTxNoticePresenter — shows each new notice from the feed once, in the style picked on the Debug
// ABOUTME: page: a floating toast per tx (updated in place by record id), or the header pill announcing it for a moment.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { TxRecord } from '@/lib/tx/types'
import type { TxNoticeOutcome } from '@/lib/tx/notices'
import { txNoticeAnnouncementAtom, txNoticeFeedAtom, txNoticeStyleAtom } from '@/state/txNotices'
import { balanceHiddenAtom } from '@/state/ui'
import { txRecord } from '@/test/fixtures/txValues'

const sonner = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast: sonner }))

import { useTxNoticePresenter, PILL_ANNOUNCE_MS } from './useTxNoticePresenter'

const send = txRecord('transfer-shielded', { amount: 5_000_000n }, { id: 'send-1' }) as TxRecord

function setup(style: 'toast' | 'pill') {
  const store = createStore()
  store.set(txNoticeStyleAtom, style)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter>{children}</MemoryRouter>
    </Provider>
  )
  renderHook(() => useTxNoticePresenter(), { wrapper })
  const push = (tone: TxNoticeOutcome, seq: number) =>
    act(() => store.set(txNoticeFeedAtom, (feed) => [...feed, { seq, tone, record: send }]))
  return { store, push }
}

beforeEach(() => {
  sonner.custom.mockReset()
  sonner.dismiss.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTxNoticePresenter — toast style', () => {
  it('shows each new notice once, as a toast keyed by the record (so a later notice replaces it)', () => {
    const { push } = setup('toast')
    push('failure', 1)
    push('success', 2)
    expect(sonner.custom).toHaveBeenCalledTimes(2)
    expect(sonner.custom.mock.calls.map((call) => (call[1] as { id: string }).id)).toEqual(['send-1', 'send-1'])
  })
})

describe('useTxNoticePresenter — pill style', () => {
  it('announces in the header pill, then folds back after a moment', () => {
    vi.useFakeTimers()
    const { store, push } = setup('pill')
    push('success', 1)
    expect(sonner.custom).not.toHaveBeenCalled()
    expect(store.get(txNoticeAnnouncementAtom)).toMatchObject({ tone: 'success', title: 'Sent 5.00 USDC', recordId: 'send-1' })
    act(() => vi.advanceTimersByTime(PILL_ANNOUNCE_MS))
    expect(store.get(txNoticeAnnouncementAtom)).toBeNull()
  })

  it('keeps a failure up until the user acts on it', () => {
    vi.useFakeTimers()
    const { store, push } = setup('pill')
    push('failure', 1)
    act(() => vi.advanceTimersByTime(PILL_ANNOUNCE_MS * 3))
    expect(store.get(txNoticeAnnouncementAtom)).toMatchObject({ tone: 'failure', title: 'Send failed' })
  })

  it('leaves the amount out while balances are hidden', () => {
    const { store, push } = setup('pill')
    act(() => store.set(balanceHiddenAtom, true))
    push('success', 1)
    expect(store.get(txNoticeAnnouncementAtom)?.title).toBe('Sent USDC')
  })
})
