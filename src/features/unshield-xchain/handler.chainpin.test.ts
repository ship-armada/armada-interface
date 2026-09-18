// ABOUTME: Resume-routing tests for the unshield-xchain handler's collapsed delivery stages (#4).
// ABOUTME: A resume parked at a collapsed delivery stage must route into the delivery wait, not fall through to a no-op that busy-loops the executor.

import { describe, it, expect, vi } from 'vitest'

vi.mock('wagmi/actions', () => ({
  getPublicClient: vi.fn(() => null),
}))
vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))

// Mock the SDK builder so importing the handler doesn't transitively load the @armada/sdk prover.
vi.mock('@/lib/shielded/unshield-xchain-sdk', () => ({
  buildXchainUnshieldSdk: vi.fn(),
}))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/keyManager', () => ({
  isUnlocked: () => false,
  getWalletId: () => 'rw-1',
  getSdkEncryptionKey: () => '0xkey',
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: vi.fn(async () => ({
    hub: {
      contracts: { privacyPool: '0x5555555555555555555555555555555555555555' },
      cctp: {
        messageTransmitter: '0x6666666666666666666666666666666666666666',
        usdc: '0x2222222222222222222222222222222222222222',
      },
    },
    clients: [],
  })),
}))

import { unshieldXchainHandler } from './handler'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

function makeCtx() {
  const upserts: TxRecord[] = []
  const ac = new AbortController()
  const ctx: ExecutorCtx<'unshield-xchain'> = {
    signal: ac.signal,
    upsert: async (r) => { upserts.push(r as TxRecord) },
  }
  return { ctx, upserts }
}

function recordWithHash(): TxRecord<'unshield-xchain'> {
  return {
    id: 'ulid-unshield-xchain-resume',
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
    // A record at submit-relayer always carries the encoded calldata persisted at build-proof —
    // required now that runSubmitAndBurn dispatches from artifacts rather than re-proving.
    artifacts: {
      sourceTxHash: '0xfeed',
      unshieldTx: {
        to: '0x5555555555555555555555555555555555555555',
        data: '0xdeadbeef',
        value: '0',
      },
    },
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31337 },
  } as TxRecord<'unshield-xchain'>
}

// #4: resume can re-enter run() with the record parked at a collapsed delivery stage. Those stages
// must route into the delivery wait (which re-polls and completes), NOT fall through to a no-op that
// would busy-loop the executor's chain. Here the mocked deployment has no destination client, so the
// delivery wait throws fast → the handler's catch writes markFailed — proving it routed in (a no-op
// fall-through would have produced ZERO upserts).
describe('unshieldXchainHandler collapsed-stage resume routing (#4)', () => {
  it.each(['iris-attestation-ready', 'client-mint-pending'] as const)(
    'routes a resume at %s into the delivery wait, not a no-op',
    async (stage) => {
      const { ctx, upserts } = makeCtx()
      const rec = { ...recordWithHash(), stage, executionState: 'active' } as TxRecord<'unshield-xchain'>
      await unshieldXchainHandler.run(rec, ctx)
      expect(upserts.length).toBeGreaterThan(0)
    },
  )
})
