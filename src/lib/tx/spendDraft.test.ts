// ABOUTME: Tests for spendDraft — the record a private send / unshield review will submit: which fee fields each kind
// ABOUTME: carries, so Review (rendered from the draft) and the stored record can't disagree.

import { describe, it, expect } from 'vitest'
import { spendDraft } from './spendDraft'
import { A, C, F, P } from '@/test/fixtures/txValues'

const RELAYER_0ZK = '0zk' + 'b'.repeat(64)
const base = {
  amount: A, recipient: '0xrecipient', toChainId: 31338, fee: 2n * F, perProofFee: F,
  protocolFee: P, cctpFee: C, feeCacheId: 'cache', broadcasterShieldedAddress: RELAYER_0ZK,
}
const broadcaster = { broadcasterFeeAmount: 2n * F, broadcasterFeePerProof: F, broadcasterShieldedAddress: RELAYER_0ZK }

describe('spendDraft', () => {
  it('a private send carries the planned total and the per-proof fee — no protocol, CCTP or chain', () => {
    expect(spendDraft('transfer-shielded', base)).toEqual({
      kind: 'transfer-shielded',
      meta: { amount: A, feeCacheId: 'cache', recipient: '0xrecipient', ...broadcaster },
    })
  })

  it('an unshield on the hub carries a protocol fee when there is one — no CCTP or chain', () => {
    expect(spendDraft('unshield-local', base)).toEqual({
      kind: 'unshield-local',
      meta: { amount: A, feeCacheId: 'cache', recipient: '0xrecipient', ...broadcaster, protocolFee: P },
    })
    expect(spendDraft('unshield-local', { ...base, protocolFee: 0n }).meta).not.toHaveProperty('protocolFee')
  })

  it('a cross-chain unshield carries its destination chain and the CCTP fee shown at review, marked as the estimate it is', () => {
    expect(spendDraft('unshield-xchain', base)).toEqual({
      kind: 'unshield-xchain',
      meta: { amount: A, feeCacheId: 'cache', recipient: '0xrecipient', toChainId: 31338, ...broadcaster, protocolFee: P, cctpFee: C, cctpFeeIsEstimate: true },
    })
    expect(spendDraft('unshield-xchain', { ...base, protocolFee: 0n, cctpFee: 0n }).meta).not.toHaveProperty('cctpFee')
    expect(spendDraft('unshield-xchain', { ...base, protocolFee: 0n, cctpFee: 0n }).meta).not.toHaveProperty('cctpFeeIsEstimate')
  })
})
