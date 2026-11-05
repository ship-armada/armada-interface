// ABOUTME: Tests for lib/tx/errorCopy — category copy resolution, the TX_REVERTED body that admits the network fee was spent
// ABOUTME: when the user's own wallet sent the reverted tx (userPaidNetworkFee), the network error's two variants, and fundsNote.

import { describe, it, expect } from 'vitest'
import { failedBeforeSending, fundsNote, resolveTxErrorCopy, retryActionLabel, userPaidNetworkFee } from './errorCopy'
import type { TxErrorCode, TxRecord } from './types'
import { getChainById, getNetworkConfig } from '@/config/network'

const reverted = { code: 'TX_REVERTED' as const, message: 'execution reverted', txHash: '0x01' as `0x${string}` }

function rec(kind: TxRecord['kind'], meta: object = {}): TxRecord {
  return { kind, meta } as unknown as TxRecord
}

describe('resolveTxErrorCopy', () => {
  it('says no funds moved for a reverted relayer-submitted tx (the relayer paid the gas)', () => {
    expect(resolveTxErrorCopy(reverted).body).toMatch(/No funds were moved/)
  })

  it('admits the network fee was spent when the user paid it (7D)', () => {
    const { title, body } = resolveTxErrorCopy(reverted, undefined, { userPaidNetworkFee: true })
    expect(title).toBe('Transaction failed on chain')
    expect(body).toBe(
      "The network mined your transaction but the contract reverted. Your USDC didn't move, but the network fee was spent.",
    )
  })

  it('leaves other codes unchanged by the option', () => {
    const rejected = { code: 'USER_REJECTED' as const, message: 'x' }
    expect(resolveTxErrorCopy(rejected, undefined, { userPaidNetworkFee: true })).toEqual(resolveTxErrorCopy(rejected))
  })

  it('falls back to the message, then the fallback, when a code has no stock body', () => {
    expect(resolveTxErrorCopy({ code: 'OTHER', message: 'boom' }).body).toBe('boom')
    expect(resolveTxErrorCopy(null, 'fallback').body).toBe('fallback')
  })

  it('a network error says it may have gone through, unless it failed before anything was sent', () => {
    const rpc = { code: 'RPC_ERROR' as const, message: 'x' }
    expect(resolveTxErrorCopy(rpc).body).toBe(
      'We hit an error talking to the chain while sending your transaction, so it may or may not have gone through. Check your balance before trying again.',
    )
    expect(resolveTxErrorCopy(rpc, undefined, { failedBeforeSending: true }).body).toBe(
      'We hit an error talking to the chain before anything was sent. Try again.',
    )
  })

  it('ends the body with the funds note when given one (7A)', () => {
    const cancelled = { code: 'CANCELLED' as const, message: 'x' }
    expect(resolveTxErrorCopy(cancelled, undefined, { fundsNote: 'Your USDC is still in your private balance.' }).body).toBe(
      'No transaction was sent. Your USDC is still in your private balance.',
    )
    // A code with no stock body or message still gets the note.
    expect(resolveTxErrorCopy(null, undefined, { fundsNote: 'Your USDC is still in your private balance.' }).body).toBe(
      'Your USDC is still in your private balance.',
    )
  })
})

describe('failedBeforeSending', () => {
  const rec = (stage: string, sourceTxHash?: `0x${string}`) =>
    ({ stage, artifacts: sourceTxHash ? { sourceTxHash } : {} }) as unknown as TxRecord

  it('is true only while the tx was still being built — nothing goes out before the submit stage', () => {
    expect(failedBeforeSending(rec('build-proof'))).toBe(true)
    expect(failedBeforeSending(rec('submit-relayer'))).toBe(false)
    expect(failedBeforeSending(rec('hub-pending', '0x01'))).toBe(false)
    expect(failedBeforeSending(rec('build-proof', '0x01'))).toBe(false)
    expect(failedBeforeSending(null)).toBe(false)
  })
})

describe('fundsNote', () => {
  const hub = getNetworkConfig().hub

  function failed(
    kind: TxRecord['kind'],
    code: TxErrorCode,
    opts: {
      stage?: string
      meta?: object
      sourceTxHash?: `0x${string}`
      stagesCompleted?: string[]
      state?: TxRecord['executionState']
    } = {},
  ): TxRecord {
    return {
      kind,
      stage: opts.stage ?? 'submit-relayer',
      meta: opts.meta ?? {},
      executionState: opts.state ?? 'failed',
      stagesCompleted: opts.stagesCompleted ?? [],
      artifacts: { error: { code, message: 'x' }, ...(opts.sourceTxHash ? { sourceTxHash: opts.sourceTxHash } : {}) },
    } as unknown as TxRecord
  }

  it('a spend that failed while it was being built: the USDC is still in the private balance, whatever the error', () => {
    for (const kind of ['transfer-shielded', 'unshield-local', 'unshield-xchain', 'yield-deposit'] as const) {
      expect(fundsNote(failed(kind, 'RPC_ERROR', { stage: 'build-proof' }))).toBe('Your USDC is still in your private balance.')
    }
    expect(fundsNote(failed('transfer-shielded', 'OTHER', { stage: 'build-proof' }))).toBe('Your USDC is still in your private balance.')
  })

  it('an error that proves nothing went out says so even at the submit stage: refused up front, declined, cancelled', () => {
    for (const code of ['PRE_FLIGHT_REVERT', 'FEE_EXPIRED', 'USER_REJECTED'] as const) {
      expect(fundsNote(failed('transfer-shielded', code))).toBe('Your USDC is still in your private balance.')
    }
    expect(fundsNote(failed('transfer-shielded', 'CANCELLED', { state: 'cancelled' }))).toBe(
      'Your USDC is still in your private balance.',
    )
  })

  it('a broadcast tx that reverted on chain moved nothing', () => {
    expect(fundsNote(failed('unshield-local', 'TX_REVERTED', { stage: 'hub-pending', sourceTxHash: '0x01' }))).toBe(
      'Your USDC is still in your private balance.',
    )
  })

  it('a shield that failed: the USDC is still in the wallet on the chain it was shielding from', () => {
    expect(fundsNote(failed('shield', 'PRE_FLIGHT_REVERT', { meta: { fromChainId: hub.chainId } }))).toBe(
      `Your USDC is still in your wallet on ${hub.name}.`,
    )
    const client = getNetworkConfig().clients[0]
    if (!client) throw new Error('expected a client chain')
    expect(fundsNote(failed('shield-xchain', 'USER_REJECTED', { meta: { fromChainId: client.chainId } }))).toBe(
      `Your USDC is still in your wallet on ${getChainById(client.chainId)?.name}.`,
    )
    // An unknown chain still says where — just not which network.
    expect(fundsNote(failed('shield', 'PRE_FLIGHT_REVERT', { meta: { fromChainId: 999_999 } }))).toBe(
      'Your USDC is still in your wallet.',
    )
  })

  it('a vault withdrawal and a merge say what stayed put', () => {
    expect(fundsNote(failed('yield-withdraw', 'FEE_EXPIRED'))).toBe('Your vault position is unchanged.')
    expect(fundsNote(failed('consolidate', 'FEE_EXPIRED'))).toBe('Your private balance is unchanged.')
  })

  it('says nothing for a failure while sending that does not prove nothing went out — the relayer may have broadcast it', () => {
    // No hash recorded isn't proof: a relayer request can time out after the relayer broadcast.
    for (const code of ['RPC_ERROR', 'OTHER', 'INTERRUPTED'] as const) {
      expect(fundsNote(failed('transfer-shielded', code))).toBeNull()
    }
    expect(fundsNote(failed('transfer-shielded', 'RPC_ERROR', { stage: 'hub-pending', sourceTxHash: '0x01' }))).toBeNull()
  })

  it('says nothing when the outcome is unknown', () => {
    for (const code of ['POLL_TIMEOUT', 'STUCK', 'DISMISSED', 'DUPLICATE_TX'] as const) {
      expect(fundsNote(failed('transfer-shielded', code, { sourceTxHash: '0x01' }))).toBeNull()
    }
    expect(fundsNote(failed('transfer-shielded', 'OTHER', { stage: 'build-proof', state: 'expired' }))).toBeNull()
  })

  it('says nothing once a cross-chain tx burned its USDC on the source chain, even if delivery then failed', () => {
    expect(fundsNote(failed('unshield-xchain', 'TX_REVERTED', { sourceTxHash: '0x01', stagesCompleted: ['hub-burn-confirmed'] }))).toBeNull()
    expect(
      fundsNote(failed('shield-xchain', 'TX_REVERTED', { meta: { fromChainId: hub.chainId }, sourceTxHash: '0x01', stagesCompleted: ['client-burn-confirmed'] })),
    ).toBeNull()
  })

  it('says nothing for a settled or in-flight tx, or with no record', () => {
    expect(fundsNote({ ...failed('transfer-shielded', 'FEE_EXPIRED'), executionState: 'completed' } as TxRecord)).toBeNull()
    expect(fundsNote({ ...failed('transfer-shielded', 'FEE_EXPIRED'), executionState: 'active' } as TxRecord)).toBeNull()
    expect(fundsNote(null)).toBeNull()
  })
})

describe('userPaidNetworkFee', () => {
  it('is true for a shield / cross-chain shield sent from the user\'s wallet (direct path)', () => {
    expect(userPaidNetworkFee(rec('shield', {}))).toBe(true)
    expect(userPaidNetworkFee(rec('shield-xchain', { useGasless: false }))).toBe(true)
  })

  it('is false on the gasless path and for every relayer-submitted spend', () => {
    expect(userPaidNetworkFee(rec('shield', { useGasless: true }))).toBe(false)
    expect(userPaidNetworkFee(rec('shield-xchain', { useGasless: true }))).toBe(false)
    for (const kind of ['transfer-shielded', 'unshield-local', 'unshield-xchain', 'yield-deposit', 'yield-withdraw', 'consolidate'] as const) {
      expect(userPaidNetworkFee(rec(kind))).toBe(false)
    }
  })

  it('is false without a record', () => {
    expect(userPaidNetworkFee(null)).toBe(false)
  })
})

describe('indeterminate outcomes (7E)', () => {
  // WHY: these txs may still land. Starting a fresh one without checking risks paying twice.
  it.each(['POLL_TIMEOUT', 'STUCK', 'DUPLICATE_TX', 'DISMISSED'] as const)(
    '%s tells the user to check their balance before starting a new transaction',
    (code) => {
      expect(resolveTxErrorCopy({ code, message: 'x' }).body).toMatch(
        /may still complete.*Check your balance before starting a new transaction\.$/,
      )
    },
  )
})

describe('retryActionLabel', () => {
  it('reads "Check again" when a retry only re-checks a tx that may already have landed', () => {
    // Retrying these re-enters the confirmation wait with the known hash — it never resends.
    expect(retryActionLabel({ code: 'POLL_TIMEOUT', message: 'x' })).toBe('Check again')
    expect(retryActionLabel({ code: 'STUCK', message: 'x' })).toBe('Check again')
    expect(retryActionLabel({ code: 'DISMISSED', message: 'x' })).toBe('Check again')
  })

  it('reads "Try again" otherwise', () => {
    expect(retryActionLabel({ code: 'RPC_ERROR', message: 'x' })).toBe('Try again')
    expect(retryActionLabel(null)).toBe('Try again')
  })
})
