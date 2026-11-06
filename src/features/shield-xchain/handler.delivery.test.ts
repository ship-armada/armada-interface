// ABOUTME: Tests for the shield-xchain handler's delivery: once the hub mint is detected, the record goes straight to
// ABOUTME: delivered in one write — no stops at the attestation / mint stages it never observes.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => false, getWalletId: () => 'rw-1' }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/shieldReconcile', () => ({ recordedShieldFees: vi.fn(async () => ({})) }))
vi.mock('@/lib/rpc', () => ({ createProvider: vi.fn(() => ({})) }))
vi.mock('@/config/deployments', () => ({
  loadDeployments: vi.fn(async () => ({
    hub: { contracts: {}, cctp: { messageTransmitter: '0x6666666666666666666666666666666666666666' } },
    clients: [],
  })),
}))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...await importActual<typeof import('@/lib/relayer')>(),
  fetchCctpDeliveryStatus: vi.fn(async () => ({ kind: 'delivered', destTxHash: '0xd00d' })),
}))

import { shieldXchainHandler } from './handler'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

type Rec = TxRecord<'shield-xchain'>

function waitingForDelivery(): Rec {
  return {
    id: 'ulid-shield-xchain-delivery',
    kind: 'shield-xchain',
    executionState: 'active',
    stage: 'iris-attestation-pending',
    stagesCompleted: ['build-proof', 'submit-relayer', 'client-burn-confirmed'],
    updatedSeq: 5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { amount: 1_000_000n, feeCacheId: 'c', fromChainId: 31338 },
    artifacts: { sourceTxHash: '0xfeed', messageHash: '0xabc', shieldRequest: { encryptedBundle: ['0x1234'] } },
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31338 },
  } as unknown as Rec
}

describe('shieldXchainHandler delivery', () => {
  it('goes straight to delivered once the hub mint is detected, without visiting the stages it never observes', async () => {
    const upserts: Rec[] = []
    const ctx: ExecutorCtx<'shield-xchain'> = { signal: new AbortController().signal, upsert: async (r) => { upserts.push(r as Rec) } }
    await shieldXchainHandler.run(waitingForDelivery(), ctx)
    const stages = upserts.map((r) => r.stage)
    expect(stages).not.toContain('iris-attestation-ready')
    expect(stages).not.toContain('hub-mint-pending')
    const last = upserts.at(-1)!
    expect(last.stage).toBe('hub-mint-confirmed')
    expect(last.executionState).toBe('completed')
    expect(last.artifacts.destTxHash).toBe('0xd00d')
    expect(last.stagesCompleted).toEqual(expect.arrayContaining(['iris-attestation-ready', 'hub-mint-pending']))
  })
})
