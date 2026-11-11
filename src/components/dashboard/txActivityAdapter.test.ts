// ABOUTME: Unit tests for the TxRecord → dashboard activity-item adapter (direction, sign, label, pending, ordering).

import { describe, it, expect } from 'vitest'
import type { TxRecord, TxKind, TxExecutionState, TxErrorCode } from '@/lib/tx/types'
import type { RequestLinkRecord } from '@/lib/shielded/requestLinks'
import {
  buildActivityItems,
  requestLinkToActivityItem,
  txRecordToActivityItem,
} from './txActivityAdapter'
import { A, C_ACTUAL, F, G, P, txRecord } from '@/test/fixtures/txValues'

function makeLink(opts: Partial<RequestLinkRecord> = {}): RequestLinkRecord {
  return {
    requestId: opts.requestId ?? 'req_abc',
    paymentLink: opts.paymentLink ?? 'https://app/pay-via-link?to=0zk&amount=25',
    amount: opts.amount ?? '25',
    note: opts.note,
    expiresAt: opts.expiresAt ?? 2_000,
    createdAt: opts.createdAt ?? 1_500,
    shieldedWalletId: opts.shieldedWalletId ?? 'w1',
  }
}

function makeRecord(
  kind: TxKind,
  opts: {
    id?: string
    amount?: bigint
    executionState?: TxExecutionState
    createdAt?: number
    updatedAt?: number
    sourceTxHash?: `0x${string}`
    recipient?: string
    errorCode?: TxErrorCode
    stage?: string
  } = {},
): TxRecord {
  return {
    id: opts.id ?? 'id-1',
    kind,
    ...(opts.stage ? { stage: opts.stage } : {}),
    executionState: opts.executionState ?? 'completed',
    createdAt: opts.createdAt ?? 1000,
    updatedAt: opts.updatedAt ?? 1000,
    meta: { amount: opts.amount ?? 1_000_000n, ...(opts.recipient ? { recipient: opts.recipient } : {}) },
    artifacts: {
      ...(opts.sourceTxHash ? { sourceTxHash: opts.sourceTxHash } : {}),
      ...(opts.errorCode ? { error: { code: opts.errorCode, message: opts.errorCode } } : {}),
    },
  } as unknown as TxRecord
}

describe('txRecordToActivityItem', () => {
  it('maps deposits (shield) to a positive inflow', () => {
    const item = txRecordToActivityItem(makeRecord('shield', { amount: 1_500_000n }))
    expect(item.kind).toBe('deposit')
    expect(item.amount).toBe(1.5)
    expect(item.label).toBe('Shield')
    expect(item.pending).toBe(false)
  })

  it('classifies an unshield as withdraw when the recipient is the connected wallet, else send', () => {
    const own = '0xME00000000000000000000000000000000000000'
    const other = '0xABCD000000000000000000000000000000000000'

    const withdraw = txRecordToActivityItem(
      makeRecord('unshield-local', { amount: 2_000_000n, recipient: own }),
      own,
    )
    expect(withdraw.kind).toBe('withdraw')
    expect(withdraw.amount).toBe(-2)

    const send = txRecordToActivityItem(
      makeRecord('unshield-local', { amount: 2_000_000n, recipient: other }),
      own,
    )
    expect(send.kind).toBe('send')
    expect(send.amount).toBe(-2)

    // No connected wallet → can't tell → defaults to send.
    const unknown = txRecordToActivityItem(makeRecord('unshield-local', { recipient: other }))
    expect(unknown.kind).toBe('send')
  })

  // Signed amounts per kind live in the spec-fixture table at the end of this file.
  it('maps outgoing transfers to send and incoming to receive', () => {
    expect(txRecordToActivityItem(makeRecord('transfer-shielded')).kind).toBe('send')
    expect(txRecordToActivityItem(makeRecord('transfer-shielded-received')).kind).toBe('receive')
  })

  it('maps both vault directions to earn', () => {
    expect(txRecordToActivityItem(makeRecord('yield-deposit')).kind).toBe('earn')
    expect(txRecordToActivityItem(makeRecord('yield-withdraw')).kind).toBe('earn')
  })

  it('maps a note merge to merge, showing only the fee as the outflow', () => {
    const merge = { ...makeRecord('consolidate', { amount: 0n }), meta: { amount: 0n, broadcasterFeeAmount: 40_000n, notesMerged: 11 } } as unknown as TxRecord
    const item = txRecordToActivityItem(merge)
    expect(item.kind).toBe('merge')
    expect(item.amount).toBe(-0.04)
    expect(item.label).toBe('Merged 11 notes')
  })

  it('flags non-terminal records as pending', () => {
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'active' })).pending).toBe(true)
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'waiting' })).pending).toBe(true)
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'completed' })).pending).toBe(false)
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'failed' })).pending).toBe(false)
  })

  it('carries the counterparty address for search: a send\'s recipient, a received payment\'s disclosed sender', () => {
    expect(txRecordToActivityItem(makeRecord('transfer-shielded', { recipient: '0zk1qyalice' })).address).toBe('0zk1qyalice')
    expect(txRecordToActivityItem(makeRecord('unshield-xchain', { recipient: '0xBob' })).address).toBe('0xBob')
    const received = { ...makeRecord('transfer-shielded-received'), meta: { amount: 1n, senderShieldedAddress: '0zk1qycarol' } } as TxRecord
    expect(txRecordToActivityItem(received).address).toBe('0zk1qycarol')
    // A shield / vault op / merge has no counterparty.
    expect(txRecordToActivityItem(makeRecord('shield')).address).toBeUndefined()
  })

  it('carries through the source tx hash when present', () => {
    expect(txRecordToActivityItem(makeRecord('shield', { sourceTxHash: '0xabc' })).txHash).toBe('0xabc')
    expect(txRecordToActivityItem(makeRecord('shield')).txHash).toBeUndefined()
  })
})

describe('requestLinkToActivityItem', () => {
  it('maps a created link to a neutral "Payment link created" row', () => {
    const item = requestLinkToActivityItem(makeLink({ amount: '25', createdAt: 1_500, expiresAt: 2_000 }))
    expect(item.kind).toBe('requestLink')
    expect(item.label).toBe('Payment link created')
    expect(item.amount).toBe(25) // positive/neutral — no sign applied here
    expect(item.pending).toBe(false)
    expect(item.requestId).toBe('req_abc')
    expect(item.expiresAt).toBe(2_000)
    expect(item.occurredAt).toBe(1_500)
  })
})

describe('buildActivityItems', () => {
  it('merges tx + request-link rows newest-first', () => {
    const tx = makeRecord('shield', { id: 'tx-old', amount: 1_000_000n, createdAt: 1_000, updatedAt: 1_000 })
    const link = makeLink({ requestId: 'req_new', createdAt: 3_000 })
    const items = buildActivityItems([tx], [link])
    expect(items.map((i) => i.id)).toEqual(['req_new', 'tx-old']) // link is newer → first
    expect(items[0]?.kind).toBe('requestLink')
  })

  it('caps the merged list at max', () => {
    const links = Array.from({ length: 5 }, (_, i) =>
      makeLink({ requestId: `req_${i}`, createdAt: 1_000 + i }),
    )
    expect(buildActivityItems([], links, null, 3)).toHaveLength(3)
  })

  it('returns every row when max is uncapped (Infinity) — the "all activity" panel path', () => {
    const links = Array.from({ length: 12 }, (_, i) =>
      makeLink({ requestId: `req_${i}`, createdAt: 1_000 + i }),
    )
    expect(buildActivityItems([], links, null, Infinity)).toHaveLength(12)
  })
})

describe('activity status derivation', () => {
  it('completed → settled; non-terminal → pending', () => {
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'completed' })).status).toBe('settled')
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'active' })).status).toBe('pending')
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'waiting' })).status).toBe('pending')
  })

  it('definitive failures → failed', () => {
    const codes = ['TX_REVERTED', 'PRE_FLIGHT_REVERT', 'INTERRUPTED', 'FEE_EXPIRED'] as const
    for (const code of codes) {
      const item = txRecordToActivityItem(makeRecord('unshield-local', { executionState: 'failed', errorCode: code }))
      expect(item.status).toBe('failed')
    }
  })

  it('a network error is a failure while the tx was being built, but unknown once it was being sent (it may have gone through)', () => {
    const rpc = (stage: string, sourceTxHash?: `0x${string}`) =>
      txRecordToActivityItem(makeRecord('unshield-local', { executionState: 'failed', errorCode: 'RPC_ERROR', stage, sourceTxHash })).status
    expect(rpc('build-proof')).toBe('failed')
    expect(rpc('submit-relayer')).toBe('unknown')
    expect(rpc('hub-pending', '0x01')).toBe('unknown')
  })

  it('user aborts → cancelled (app Cancel button + declined wallet prompt), code is authoritative', () => {
    // App Cancel button before broadcast.
    expect(
      txRecordToActivityItem(makeRecord('shield', { executionState: 'cancelled', errorCode: 'CANCELLED' })).status,
    ).toBe('cancelled')
    // Declined wallet signature — lands on a `failed` state but is a user cancellation, not a failure.
    expect(
      txRecordToActivityItem(makeRecord('shield', { executionState: 'failed', errorCode: 'USER_REJECTED' })).status,
    ).toBe('cancelled')
    // A CANCELLED code that lands on a `failed` state (e.g. thrown → markFailed) is still cancelled.
    expect(
      txRecordToActivityItem(makeRecord('shield', { executionState: 'failed', errorCode: 'CANCELLED' })).status,
    ).toBe('cancelled')
  })

  it('indeterminate outcomes → unknown (may still have settled on chain)', () => {
    // expired = past the time budget; we never watched it to completion.
    expect(txRecordToActivityItem(makeRecord('shield', { executionState: 'expired' })).status).toBe('unknown')
    // DISMISSED sits on a `cancelled` executionState but is indeterminate — must NOT read as cancelled.
    expect(
      txRecordToActivityItem(makeRecord('shield', { executionState: 'cancelled', errorCode: 'DISMISSED' })).status,
    ).toBe('unknown')
    for (const code of ['POLL_TIMEOUT', 'DUPLICATE_TX'] as const) {
      expect(
        txRecordToActivityItem(makeRecord('shield', { executionState: 'failed', errorCode: code })).status,
      ).toBe('unknown')
    }
  })
})

describe('row amount per kind (spec fixture — the receipt headline, signed by direction)', () => {
  const RELAYER_0ZK = '0zk' + 'b'.repeat(64)
  const spend = { amount: A, broadcasterFeeAmount: F, broadcasterShieldedAddress: RELAYER_0ZK }
  it.each([
    ['shield', txRecord('shield', { amount: A, fromChainId: 31337, useGasless: true, feeAmount: F, protocolFee: P }), 10],
    ['shield-xchain', txRecord('shield-xchain', { amount: A, fromChainId: 31338, feeAmount: F, protocolFee: P, cctpFee: C_ACTUAL }), 10],
    ['transfer-shielded', txRecord('transfer-shielded', { ...spend, recipient: '0zk' + 'c'.repeat(64) }), -10],
    ['transfer-shielded-received', txRecord('transfer-shielded-received', { amount: A }), 10],
    ['unshield-local', txRecord('unshield-local', { ...spend, recipient: '0x1234567890abcdef1234567890abcdef12345678' }), -10],
    ['yield-deposit', txRecord('yield-deposit', spend), -10],
    ['yield-withdraw', txRecord('yield-withdraw', { ...spend, amount: G, shares: 9_523_809n }), 9.999999],
    ['consolidate', txRecord('consolidate', { ...spend, amount: 0n, broadcasterFeeAmount: 2n * F, tokenAddress: '0xusdc' }), -2.000006],
  ])('%s', (_kind, record, amount) => {
    expect(txRecordToActivityItem(record).amount).toBe(amount)
  })
})
