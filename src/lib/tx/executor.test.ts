// ABOUTME: Tests for executor — cancelTx terminal-state guard.

import { describe, it, expect, beforeEach } from 'vitest'
import { getDefaultStore } from 'jotai'
import { cancelTx } from './executor'
import { upsertTxAtom, txListAtom } from '@/state/tx'
import { cacheClear } from '../cache'
import type { TxRecord } from './types'

function makeRecord(overrides: Partial<TxRecord> = {}): TxRecord {
  return {
    id: 'ulid-test-1',
    kind: 'shield',
    executionState: 'completed',
    stage: 'hub-confirmed',
    stagesCompleted: ['build-proof', 'submit-relayer'],
    updatedSeq: 5,
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    meta: { amount: 1_000_000n, feeCacheId: 'c', fromChainId: 31337 } as TxRecord<'shield'>['meta'],
    artifacts: {},
    walletContext: {
      evmAddress: '0xabc',
      railgunWalletId: 'rw-1',
      sourceChainId: 31337,
    },
    ...overrides,
  } as TxRecord
}

describe('cancelTx', () => {
  beforeEach(async () => {
    // Reset the shared default-store atoms between tests.
    const store = getDefaultStore()
    store.set(txListAtom, [])
    await cacheClear('txHistory')
  })

  it('does NOT clobber a record that is already in a terminal state', () => {
    const store = getDefaultStore()
    const completed = makeRecord({ executionState: 'completed', updatedSeq: 5 })
    store.set(upsertTxAtom, completed)

    cancelTx(completed.id)

    const after = store.get(txListAtom).find(t => t.id === completed.id)
    expect(after?.executionState).toBe('completed')
    expect(after?.updatedSeq).toBe(5)
  })

  it.each(['failed', 'expired', 'cancelled'] as const)(
    'leaves a %s record alone',
    (state) => {
      const store = getDefaultStore()
      const rec = makeRecord({ id: `ulid-${state}`, executionState: state, updatedSeq: 7 })
      store.set(upsertTxAtom, rec)

      cancelTx(rec.id)

      const after = store.get(txListAtom).find(t => t.id === rec.id)
      expect(after?.executionState).toBe(state)
      expect(after?.updatedSeq).toBe(7)
    },
  )

  it('cancels a non-terminal record (active)', () => {
    const store = getDefaultStore()
    const active = makeRecord({ id: 'ulid-active', executionState: 'active', updatedSeq: 3 })
    store.set(upsertTxAtom, active)

    cancelTx(active.id)

    const after = store.get(txListAtom).find(t => t.id === active.id)
    expect(after?.executionState).toBe('cancelled')
    expect(after?.updatedSeq).toBe(4)
  })
})
