// ABOUTME: Idempotent re-entry (WS1.3) for the cross-chain unshield's submit stage: a record that already has a sourceTxHash
// ABOUTME: must never re-POST the burn or re-prove — it re-waits on the relayer status and carries on to the burn-confirmed stage.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// A re-POST would burn the user's USDC a second time on the hub — it must never fire on re-entry with a hash.
const submitRelayMock = vi.hoisted(() => vi.fn(() => { throw new Error('submitRelay must not be called on idempotent re-entry') }))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/relayer')>()),
  submitRelay: submitRelayMock,
}))
const buildMock = vi.hoisted(() => vi.fn(() => { throw new Error('buildXchainUnshieldSdk must not be called on idempotent re-entry') }))
vi.mock('@/lib/shielded/unshield-xchain-sdk', () => ({ buildXchainUnshieldSdk: buildMock }))

const pollMock = vi.hoisted(() => vi.fn(async () => ({ status: 'done' as const, value: { status: 'confirmed' as const } })))
vi.mock('@/lib/tx/poller', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tx/poller')>()),
  poll: pollMock,
  pollRelayStatusOnce: vi.fn(async () => null),
}))

// After the relayer confirms, the handler reads the hub receipt for the CCTP MessageSent and the destination's block.
vi.mock('wagmi/actions', () => ({
  getPublicClient: vi.fn(() => ({ getTransactionReceipt: async () => ({ logs: [] }), getBlockNumber: async () => 100n })),
}))
vi.mock('@/lib/cctp', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/cctp')>()),
  extractCctpMessageFromReceipt: () => ({ messageHash: '0xmessagehash', nonce: '0xnonce' }),
}))
vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/pending-spend', () => ({
  markSpendPendingForRecord: vi.fn(async () => {}),
  clearSpendPendingForTx: vi.fn(async () => {}),
  forgetSpendPlan: vi.fn(),
}))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => true, getWalletId: () => 'rw-1' }))
vi.mock('@/lib/shielded/selfMetadata', () => ({ encodeTxSelfMetadata: () => undefined }))
vi.mock('@/config/deployments', () => ({
  loadDeployments: vi.fn(async () => ({
    hub: {
      contracts: { privacyPool: '0x5555555555555555555555555555555555555555' },
      cctp: { messageTransmitter: '0x6666666666666666666666666666666666666666', usdc: '0x2222222222222222222222222222222222222222' },
    },
    clients: [],
  })),
}))

import { unshieldXchainHandler } from './handler'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

function recordWithHash(): TxRecord<'unshield-xchain'> {
  return {
    id: 'ulid-unshield-xchain-reentry',
    kind: 'unshield-xchain',
    executionState: 'retrying',
    stage: 'submit-relayer',
    stagesCompleted: ['build-proof'],
    updatedSeq: 3,
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
    // The calldata build-proof stashed (a record at submit-relayer always carries it).
    artifacts: {
      sourceTxHash: '0xfeed',
      unshieldTx: { to: '0x5555555555555555555555555555555555555555', data: '0xdeadbeef', value: '0' },
    },
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as TxRecord<'unshield-xchain'>
}

describe('unshieldXchainHandler submit idempotency (P0-1)', () => {
  beforeEach(() => {
    submitRelayMock.mockClear()
    buildMock.mockClear()
    pollMock.mockClear()
  })

  it('re-entering submit-relayer with a known hash re-waits on the relayer status and moves on, without re-burning', async () => {
    const upserts: TxRecord[] = []
    const ctx: ExecutorCtx<'unshield-xchain'> = { signal: new AbortController().signal, upsert: async (r) => { upserts.push(r as TxRecord) } }

    await unshieldXchainHandler.run(recordWithHash(), ctx)

    expect(submitRelayMock).not.toHaveBeenCalled()
    expect(buildMock).not.toHaveBeenCalled()
    expect(pollMock).toHaveBeenCalledOnce()
    const last = upserts.at(-1)
    expect(last?.stage).toBe('hub-burn-confirmed')
    expect(last?.executionState).not.toBe('failed')
    expect(last?.artifacts.sourceTxHash).toBe('0xfeed')
  })
})
