// ABOUTME: Tests for useMergeNotes — opening the merge modal with an intent, and the "Merge notes" remedy a
// ABOUTME: blocked flow's error screen offers only for records whose error carries the merge-notes remedy.

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { useMergeNotes } from './useMergeNotes'
import { mergeIntentAtom, openModalAtom } from '@/state/ui'
import type { TxRecord } from '@/lib/tx/types'

function setup() {
  const store = createStore()
  store.set(openModalAtom, 'payment')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const { result } = renderHook(() => useMergeNotes(), { wrapper })
  return { store, result }
}

const failed = (remedy?: 'merge-notes') =>
  ({
    kind: 'unshield-local',
    meta: { amount: 7n, broadcasterFeeAmount: 30n },
    artifacts: { error: { code: 'PRE_FLIGHT_REVERT', message: 'x', ...(remedy ? { remedy } : {}) } },
  }) as unknown as TxRecord

describe('useMergeNotes', () => {
  it('opens the merge modal with the given intent (replacing the current flow)', () => {
    const { store, result } = setup()
    act(() => result.current.openMerge({ token: 'shares' }))
    expect(store.get(openModalAtom)).toBe('merge')
    expect(store.get(mergeIntentAtom)).toEqual({ token: 'shares' })
  })

  it('offers "Merge notes" for a record blocked by fragmentation, carrying its blocked spend', () => {
    const { store, result } = setup()
    const remedy = result.current.remedyFor(failed('merge-notes'))
    expect(remedy?.label).toBe('Merge notes')
    act(() => remedy!.onClick())
    expect(store.get(openModalAtom)).toBe('merge')
    expect(store.get(mergeIntentAtom)).toEqual({
      token: 'usdc',
      blocked: { kind: 'unshield-local', amount: 7n, perProofFee: 30n },
    })
  })

  it('offers nothing for other failures or no record', () => {
    const { result } = setup()
    expect(result.current.remedyFor(failed())).toBeUndefined()
    expect(result.current.remedyFor(null)).toBeUndefined()
  })
})
