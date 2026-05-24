// ABOUTME: Reducer tests — patchArtifacts cursor pattern + typed-error mark transitions (markFailed string|TxError, markCancelled, markDismissed).

import { describe, it, expect } from 'vitest'
import { markCancelled, markDismissed, markFailed, markWaiting, patchArtifacts } from './reducer'
import type { TxRecord } from './types'

function baseXchainRecord(): TxRecord<'unshield-xchain'> {
  return {
    id: '01TESTID00000000000000',
    kind: 'unshield-xchain',
    executionState: 'pending',
    stage: 'iris-attestation-pending',
    stagesCompleted: ['build-proof', 'submit-relayer', 'hub-burn-confirmed'],
    updatedSeq: 7,
    createdAt: 1_000_000,
    updatedAt: 1_000_500,
    meta: {
      amount: 1_000_000n,
      feeCacheId: 'fee-1',
      toChainId: 84532,
      recipient: '0x0000000000000000000000000000000000000001',
    },
    artifacts: {
      sourceTxHash: '0xabc' as `0x${string}`,
      cctpNonce: '0xnonce' as `0x${string}`,
      destFromBlock: '1000',
    },
    walletContext: {
      evmAddress: '0xeve',
      railgunWalletId: 'wallet-1',
      sourceChainId: 31337,
    },
  }
}

describe('patchArtifacts', () => {
  it('merges new artifact values without touching stage or executionState', () => {
    const r = markWaiting(baseXchainRecord())
    const seqBefore = r.updatedSeq

    const next = patchArtifacts(r, { destFromBlock: '6000' })

    expect(next.stage).toBe(r.stage)
    expect(next.executionState).toBe('waiting')
    expect(next.artifacts.destFromBlock).toBe('6000')
    expect(next.artifacts.cctpNonce).toBe('0xnonce') // preserved
    expect(next.artifacts.sourceTxHash).toBe('0xabc') // preserved
    expect(next.updatedSeq).toBe(seqBefore + 1)
  })

  it('does not mutate the input record', () => {
    const r = baseXchainRecord()
    const snapshot = JSON.parse(JSON.stringify(r, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ))

    patchArtifacts(r, { destFromBlock: '9999' })

    const after = JSON.parse(JSON.stringify(r, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ))
    expect(after).toEqual(snapshot)
  })

  it('supports a chained sequence of patches (cursor pattern)', () => {
    let cursor = markWaiting(baseXchainRecord())
    cursor = patchArtifacts(cursor, { destFromBlock: '5000' })
    cursor = patchArtifacts(cursor, { destFromBlock: '6000' })
    cursor = patchArtifacts(cursor, { destFromBlock: '7000' })

    expect(cursor.artifacts.destFromBlock).toBe('7000')
    expect(cursor.executionState).toBe('waiting')
    // Three patches after markWaiting (which itself bumped once).
    expect(cursor.updatedSeq).toBe(7 + 1 + 3)
  })
})

describe('markFailed — typed error', () => {
  it('wraps a bare string as { code: "OTHER", message } for backward compatibility', () => {
    // Legacy call sites can still pass a string; the reducer normalises rather than forcing a
    // big-bang rewrite of every handler. Important for incremental rollout.
    const r = markFailed(baseXchainRecord(), 'raw error from somewhere')
    expect(r.executionState).toBe('failed')
    expect(r.artifacts.error).toEqual({ code: 'OTHER', message: 'raw error from somewhere' })
  })

  it('passes a typed TxError through unchanged', () => {
    // The handler classifier should be able to set POLL_TIMEOUT or TX_REVERTED with a txHash;
    // the reducer must not lose those fields by re-wrapping.
    const txErr = { code: 'POLL_TIMEOUT' as const, message: 'lost track', txHash: '0xfeed' as `0x${string}` }
    const r = markFailed(baseXchainRecord(), txErr)
    expect(r.artifacts.error).toEqual(txErr)
  })
})

describe('markCancelled vs markDismissed', () => {
  it('markCancelled writes a CANCELLED-coded error to distinguish from internal cleanup paths', () => {
    // The error code differentiates "user explicitly clicked Cancel" from other cancellation
    // origins (auto-lock, tab close). UI can choose to render specific copy.
    const r = markCancelled(baseXchainRecord())
    expect(r.executionState).toBe('cancelled')
    expect(r.artifacts.error?.code).toBe('CANCELLED')
    expect(r.artifacts.error?.txHash).toBeUndefined()
  })

  it('markDismissed writes a DISMISSED error AND carries forward sourceTxHash for explorer linking', () => {
    // The whole point of dismiss-vs-cancel: the on-chain tx is still running. We MUST preserve
    // the txHash so the user can find it on the explorer; otherwise dismissing post-broadcast
    // strands them with no recovery path.
    const r = markDismissed(baseXchainRecord()) // baseXchainRecord has sourceTxHash: '0xabc'
    expect(r.executionState).toBe('cancelled')
    expect(r.artifacts.error?.code).toBe('DISMISSED')
    expect(r.artifacts.error?.txHash).toBe('0xabc')
  })

  it('markDismissed handles a record without sourceTxHash by omitting txHash from the error', () => {
    // Edge case: dismissing a pre-broadcast record (TxActions wouldn't render the dismiss
    // button in this state, but the reducer is defensive). Should not synthesise a bogus hash.
    const r = baseXchainRecord()
    delete (r.artifacts as { sourceTxHash?: `0x${string}` }).sourceTxHash
    const dismissed = markDismissed(r)
    expect(dismissed.artifacts.error?.code).toBe('DISMISSED')
    expect(dismissed.artifacts.error?.txHash).toBeUndefined()
  })
})
