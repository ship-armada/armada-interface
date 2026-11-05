// ABOUTME: Tests for useBalanceLatencyProbe — times a tx's completion to the next change of the shielded balance (3D):
// ABOUTME: reports it once (telemetry + the session samples the Debug page reads), or as timed out if nothing changes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import type { TxExecutionState, TxKind, TxRecord } from '@/lib/tx/types'
import { txListAtom } from '@/state/tx'
import { activeShieldedWalletIdAtom, shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'
import { balanceLatencySamplesAtom } from '@/state/txTimings'
import { txRecord } from '@/test/fixtures/txValues'

const trackMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/telemetry', () => ({ track: trackMock }))

import { useBalanceLatencyProbe, BALANCE_PROBE_TIMEOUT_MS } from './useBalanceLatencyProbe'

function rec(state: TxExecutionState, kind: TxKind = 'transfer-shielded', id = 'tx-1'): TxRecord {
  return txRecord(kind, { amount: 1n }, { id, executionState: state })
}

function setup() {
  const store = createStore()
  store.set(activeShieldedWalletIdAtom, 'w')
  store.set(shieldedUsdcAtom, 10_000_000n)
  store.set(yieldSharesAtom, 0n)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useBalanceLatencyProbe(), { wrapper })
  return store
}

beforeEach(() => {
  vi.useFakeTimers()
  trackMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBalanceLatencyProbe', () => {
  it('reports how long after completing the balance changed', () => {
    const store = setup()
    act(() => store.set(txListAtom, [rec('waiting')]))
    act(() => store.set(txListAtom, [rec('completed')]))
    act(() => vi.advanceTimersByTime(7_000))
    act(() => store.set(shieldedUsdcAtom, 4_000_000n))
    expect(trackMock).toHaveBeenCalledWith('tx.balance.latency', { id: 'tx-1', kind: 'transfer-shielded', durationMs: 7_000, timedOut: false })
    expect(store.get(balanceLatencySamplesAtom)).toEqual([{ kind: 'transfer-shielded', durationMs: 7_000 }])
    // Once only.
    act(() => store.set(shieldedUsdcAtom, 3_000_000n))
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  it('counts a vault-share change too', () => {
    const store = setup()
    act(() => store.set(txListAtom, [rec('active', 'yield-deposit')]))
    act(() => store.set(txListAtom, [rec('completed', 'yield-deposit')]))
    act(() => vi.advanceTimersByTime(2_000))
    act(() => store.set(yieldSharesAtom, 5n))
    expect(trackMock).toHaveBeenCalledWith('tx.balance.latency', { id: 'tx-1', kind: 'yield-deposit', durationMs: 2_000, timedOut: false })
  })

  it('reports a timeout (and keeps no sample) when the balance never changes', () => {
    const store = setup()
    act(() => store.set(txListAtom, [rec('waiting')]))
    act(() => store.set(txListAtom, [rec('completed')]))
    act(() => vi.advanceTimersByTime(BALANCE_PROBE_TIMEOUT_MS))
    expect(trackMock).toHaveBeenCalledWith('tx.balance.latency', { id: 'tx-1', kind: 'transfer-shielded', durationMs: BALANCE_PROBE_TIMEOUT_MS, timedOut: true })
    expect(store.get(balanceLatencySamplesAtom)).toEqual([])
  })

  it('ignores records that were already settled when first seen (history), and received payments', () => {
    const store = setup()
    act(() => store.set(txListAtom, [rec('completed', 'transfer-shielded', 'old')]))
    act(() => store.set(txListAtom, [rec('completed', 'transfer-shielded', 'old'), rec('completed', 'transfer-shielded-received', 'in')]))
    act(() => store.set(shieldedUsdcAtom, 1n))
    expect(trackMock).not.toHaveBeenCalled()
  })
})
