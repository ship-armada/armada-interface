// ABOUTME: Tests for the unshield-xchain handler's delivery: once the destination mint is detected, the record goes straight
// ABOUTME: to delivered in one write — no stops at the attestation / mint stages it never observes.

import { describe, it, expect, vi } from 'vitest'

vi.mock('wagmi/actions', () => ({ getPublicClient: vi.fn(() => null) }))
vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/unshield-xchain-sdk', () => ({ buildXchainUnshieldSdk: vi.fn() }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/pending-spend', () => ({
  markSpendPendingForRecord: vi.fn(async () => {}),
  clearSpendPendingForTx: vi.fn(async () => {}),
  forgetSpendPlan: vi.fn(),
}))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => false, getWalletId: () => 'rw-1' }))
vi.mock('@/lib/rpc', () => ({ createProvider: vi.fn(() => ({})) }))
vi.mock('@/config/deployments', () => ({
  loadDeployments: vi.fn(async () => ({
    hub: { contracts: { privacyPool: '0x5555555555555555555555555555555555555555' }, cctp: {} },
    clients: [{ chainId: 31338, cctp: { messageTransmitter: '0x6666666666666666666666666666666666666666' } }],
  })),
}))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...await importActual<typeof import('@/lib/relayer')>(),
  fetchCctpDeliveryStatus: vi.fn(async () => ({ kind: 'delivered', destTxHash: '0xd00d' })),
}))

import { unshieldXchainHandler } from './handler'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

type Rec = TxRecord<'unshield-xchain'>

function waitingForDelivery(): Rec {
  return {
    id: 'ulid-unshield-xchain-delivery',
    kind: 'unshield-xchain',
    executionState: 'active',
    stage: 'iris-attestation-pending',
    stagesCompleted: ['build-proof', 'submit-relayer', 'hub-burn-confirmed'],
    updatedSeq: 5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {
      amount: 1_000_000n,
      feeCacheId: 'c',
      recipient: '0x3333333333333333333333333333333333333333',
      toChainId: 31338,
      broadcasterFeeAmount: 0n,
      broadcasterShieldedAddress: '0zk1relayer',
    },
    artifacts: { sourceTxHash: '0xfeed', messageHash: '0xabc' },
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as unknown as Rec
}

describe('unshieldXchainHandler delivery', () => {
  it('goes straight to delivered once the mint is detected, without visiting the stages it never observes', async () => {
    const upserts: Rec[] = []
    const ctx: ExecutorCtx<'unshield-xchain'> = { signal: new AbortController().signal, upsert: async (r) => { upserts.push(r as Rec) } }
    await unshieldXchainHandler.run(waitingForDelivery(), ctx)
    const stages = upserts.map((r) => r.stage)
    expect(stages).not.toContain('iris-attestation-ready')
    expect(stages).not.toContain('client-mint-pending')
    const last = upserts.at(-1)!
    expect(last.stage).toBe('client-mint-confirmed')
    expect(last.executionState).toBe('completed')
    expect(last.artifacts.destTxHash).toBe('0xd00d')
    // The skipped stages still count as done, so the stepper shows every row complete.
    expect(last.stagesCompleted).toEqual(expect.arrayContaining(['iris-attestation-ready', 'client-mint-pending']))
  })
})
