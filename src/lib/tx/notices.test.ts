// ABOUTME: Tests for lib/tx/notices — which tx record changes are worth telling the user about outside the flow modal:
// ABOUTME: settled / failed / uncertain outcomes, leaving the modal mid-flight, and freshly received payments (never history).

import { describe, it, expect } from 'vitest'
import type { TxExecutionState, TxRecord } from './types'
import { detectTxNotices, snapshotTxs, RECEIVED_NOTICE_MAX_AGE_MS } from './notices'
import { txRecord } from '@/test/fixtures/txValues'

const NOW = 1_700_000_100_000
const NONE: ReadonlySet<string> = new Set()

function send(state: TxExecutionState, overrides: Partial<TxRecord> = {}): TxRecord {
  return txRecord('transfer-shielded', { amount: 5_000_000n }, { id: 'send-1', executionState: state, ...overrides })
}

function received(createdAt: number, id = 'recv-1'): TxRecord {
  return txRecord('transfer-shielded-received', { amount: 2_000_000n }, { id, executionState: 'completed', createdAt })
}

describe('detectTxNotices', () => {
  it.each<[TxExecutionState, Partial<TxRecord>, string | null]>([
    ['completed', {}, 'success'],
    ['failed', { artifacts: { error: { code: 'TX_REVERTED', message: 'x' } } } as Partial<TxRecord>, 'failure'],
    ['failed', { artifacts: { error: { code: 'POLL_TIMEOUT', message: 'x' } } } as Partial<TxRecord>, 'uncertain'],
    ['expired', {}, 'uncertain'],
    ['cancelled', { artifacts: { error: { code: 'CANCELLED', message: 'x' } } } as Partial<TxRecord>, null],
  ])('reports a watched tx reaching %s %o as %s', (state, overrides, tone) => {
    const prev = snapshotTxs([send('waiting')], NONE)
    const events = detectTxNotices(prev, [send(state, overrides)], NONE, NOW)
    expect(events.map((e) => e.tone)).toEqual(tone ? [tone] : [])
  })

  it('stays quiet while the tx is on screen (its modal or receipt shows the outcome)', () => {
    const inView = new Set(['send-1'])
    const prev = snapshotTxs([send('waiting')], inView)
    expect(detectTxNotices(prev, [send('completed')], inView, NOW)).toEqual([])
  })

  it('reports "pending" when the user leaves a tx that is still in flight', () => {
    const prev = snapshotTxs([send('active')], new Set(['send-1']))
    const events = detectTxNotices(prev, [send('active')], NONE, NOW)
    expect(events.map((e) => e.tone)).toEqual(['pending'])
  })

  it('says nothing when the user leaves a tx that already settled (they saw the outcome)', () => {
    const prev = snapshotTxs([send('completed')], new Set(['send-1']))
    expect(detectTxNotices(prev, [send('completed')], NONE, NOW)).toEqual([])
  })

  it('reports a freshly received payment', () => {
    const prev = snapshotTxs([], NONE)
    const events = detectTxNotices(prev, [received(NOW - 60_000)], NONE, NOW)
    expect(events.map((e) => [e.tone, e.record.id])).toEqual([['received', 'recv-1']])
  })

  it('ignores received payments older than the cutoff (history rebuilt from chain)', () => {
    const prev = snapshotTxs([], NONE)
    expect(detectTxNotices(prev, [received(NOW - RECEIVED_NOTICE_MAX_AGE_MS - 1)], NONE, NOW)).toEqual([])
  })

  it('never re-reports a record it has already seen, or one that first appears already settled', () => {
    const prev = snapshotTxs([received(NOW - 60_000)], NONE)
    expect(detectTxNotices(prev, [received(NOW - 60_000)], NONE, NOW)).toEqual([])
    const fresh = snapshotTxs([], NONE)
    expect(detectTxNotices(fresh, [send('completed', { id: 'old-send' })], NONE, NOW)).toEqual([])
  })
})
