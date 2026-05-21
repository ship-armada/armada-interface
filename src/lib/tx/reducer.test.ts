// ABOUTME: Reducer tests focused on patchArtifacts — the artifact-only transition used by long-running polls to persist progress between ticks.

import { describe, it, expect } from 'vitest'
import { patchArtifacts, markWaiting } from './reducer'
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
