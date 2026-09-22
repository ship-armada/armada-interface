// ABOUTME: Tests for reportTerminalFailure — always emits a tx.failed info event; forwards only the
// ABOUTME: unexpected-failure codes (OTHER / TX_REVERTED / POLL_TIMEOUT) to Sentry via trackError.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({ track: vi.fn(), trackError: vi.fn() }))
vi.mock('../telemetry', () => ({ track: hoisted.track, trackError: hoisted.trackError }))

import { reportTerminalFailure } from './failureReport'
import type { TxError, TxErrorCode, TxRecord } from './types'

function failedRecord(error: TxError | undefined): TxRecord {
  return {
    id: 'ulid-fail-1',
    kind: 'shield',
    executionState: 'failed',
    stage: 'build-proof',
    stagesCompleted: [],
    updatedSeq: 3,
    createdAt: Date.now() - 10_000,
    updatedAt: Date.now(),
    meta: {} as TxRecord<'shield'>['meta'],
    artifacts: error !== undefined ? { error } : {},
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as TxRecord
}

beforeEach(() => {
  hoisted.track.mockReset()
  hoisted.trackError.mockReset()
})

describe('reportTerminalFailure — tx.failed info event', () => {
  it('always emits tx.failed with the record id, kind, and error code', () => {
    reportTerminalFailure(failedRecord({ code: 'USER_REJECTED', message: 'declined' }))
    expect(hoisted.track).toHaveBeenCalledWith('tx.failed', {
      id: 'ulid-fail-1',
      kind: 'shield',
      errorCode: 'USER_REJECTED',
    })
  })

  it('emits tx.failed with an undefined code when the record carries no error detail', () => {
    reportTerminalFailure(failedRecord(undefined))
    expect(hoisted.track).toHaveBeenCalledWith('tx.failed', {
      id: 'ulid-fail-1',
      kind: 'shield',
      errorCode: undefined,
    })
    expect(hoisted.trackError).not.toHaveBeenCalled()
  })
})

describe('reportTerminalFailure — Sentry funnel (trackError)', () => {
  it.each(['OTHER', 'TX_REVERTED', 'POLL_TIMEOUT'] as const)(
    'forwards %s to Sentry',
    (code: TxErrorCode) => {
      reportTerminalFailure(failedRecord({ code, message: `${code} happened` }))
      expect(hoisted.trackError).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    'USER_REJECTED',
    'FEE_EXPIRED',
    'RPC_ERROR',
    'PRE_FLIGHT_REVERT',
    'DUPLICATE_TX',
    'CANCELLED',
    'DISMISSED',
    'INTERRUPTED',
    'STUCK',
  ] as const)('does NOT forward %s to Sentry', (code: TxErrorCode) => {
    reportTerminalFailure(failedRecord({ code, message: `${code} happened` }))
    expect(hoisted.trackError).not.toHaveBeenCalled()
    // …but it is still counted at the info tier.
    expect(hoisted.track).toHaveBeenCalledWith('tx.failed', {
      id: 'ulid-fail-1',
      kind: 'shield',
      errorCode: code,
    })
  })

  it('forwards the error message, kind, code, and public source-chain hash to Sentry', () => {
    reportTerminalFailure(
      failedRecord({ code: 'TX_REVERTED', message: 'reverted on chain', txHash: '0xdeadbeef' }),
    )
    const [, err, props] = hoisted.trackError.mock.calls[0]!
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('reverted on chain')
    expect(props).toEqual({ scope: 'tx.failure', kind: 'shield', code: 'TX_REVERTED', txHash: '0xdeadbeef' })
  })

  it('omits txHash from the Sentry context when the error carries none', () => {
    reportTerminalFailure(failedRecord({ code: 'OTHER', message: 'circuit fetch … → 404' }))
    const [, , props] = hoisted.trackError.mock.calls[0]!
    expect(props).toEqual({ scope: 'tx.failure', kind: 'shield', code: 'OTHER' })
  })
})
