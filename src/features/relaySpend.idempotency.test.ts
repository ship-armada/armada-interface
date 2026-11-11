// ABOUTME: Idempotent re-entry (WS1.3) for the relayer-submitted spends — transfer, vault deposit / withdrawal, note merge: a
// ABOUTME: record that already has a sourceTxHash must never re-POST or re-prove; it finishes via the relayer status poll.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// A re-POST of a broadcast spend 409s (or worse, spends again) — it must never fire on re-entry with a hash.
const submitRelayMock = vi.hoisted(() => vi.fn(() => { throw new Error('submitRelay must not be called on idempotent re-entry') }))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/relayer')>()),
  submitRelay: submitRelayMock,
}))

// Nor may it re-prove: build-proof already ran and stashed the calldata.
const builders = vi.hoisted(() => ({
  transfer: vi.fn(() => { throw new Error('buildTransferSdk must not be called on idempotent re-entry') }),
  yieldAdapt: vi.fn(() => { throw new Error('buildYieldAdaptSdk must not be called on idempotent re-entry') }),
  consolidate: vi.fn(() => { throw new Error('buildConsolidateSdk must not be called on idempotent re-entry') }),
}))
vi.mock('@/lib/shielded/transfer-sdk', () => ({ buildTransferSdk: builders.transfer }))
vi.mock('@/lib/shielded/yield-sdk', () => ({ buildYieldAdaptSdk: builders.yieldAdapt }))
vi.mock('@/lib/shielded/consolidate-sdk', () => ({ buildConsolidateSdk: builders.consolidate }))

const pollMock = vi.hoisted(() => vi.fn(async () => ({ status: 'done' as const, value: { status: 'confirmed' as const } })))
vi.mock('@/lib/tx/poller', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tx/poller')>()),
  poll: pollMock,
  pollRelayStatusOnce: vi.fn(async () => null),
}))

vi.mock('@/lib/shielded/pending-spend', () => ({
  markSpendPendingForRecord: vi.fn(async () => {}),
  clearSpendPendingForTx: vi.fn(async () => {}),
  forgetSpendPlan: vi.fn(),
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: async () => ({ hub: { contracts: { privacyPool: '0xpool' }, cctp: { usdc: '0xusdc' } } }),
  loadYieldDeployment: async () => null,
}))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => true, getWalletId: () => 'rw-1' }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))
vi.mock('@/lib/shielded/selfMetadata', () => ({ encodeTxSelfMetadata: () => undefined }))
// The vault withdrawal reads its receipt after confirming (redeemed-gross reconcile); no receipt → keeps its estimate.
vi.mock('@/lib/rpc', () => ({ createProvider: () => ({ getTransactionReceipt: async () => null }) }))

import { transferShieldedHandler } from './transfer-shielded/handler'
import { yieldDepositHandler } from './yield-deposit/handler'
import { yieldWithdrawHandler } from './yield-withdraw/handler'
import { consolidateHandler } from './consolidate/handler'
import { txRecord } from '@/test/fixtures/txValues'
import type { ExecutorCtx, StageHandler } from '@/lib/tx/executor'
import type { TxKind, TxRecord } from '@/lib/tx/types'

const spend = { amount: 5_000_000n, broadcasterFeeAmount: 20_000n, broadcasterFeePerProof: 20_000n, broadcasterShieldedAddress: '0zk_relayer' }
// The calldata build-proof stashed (a real record always carries it by submit time).
const YIELD_TX = { yieldTx: { to: '0xadapter', data: '0x', value: '0' } }
const CASES: [string, StageHandler<TxKind>, TxKind, object, object?][] = [
  ['transfer-shielded', transferShieldedHandler as StageHandler<TxKind>, 'transfer-shielded', { ...spend, recipient: '0zk' + 'c'.repeat(64) }],
  ['yield-deposit', yieldDepositHandler as StageHandler<TxKind>, 'yield-deposit', spend, YIELD_TX],
  ['yield-withdraw', yieldWithdrawHandler as StageHandler<TxKind>, 'yield-withdraw', { ...spend, shares: 4_000_000n }, YIELD_TX],
  ['consolidate', consolidateHandler as StageHandler<TxKind>, 'consolidate', { ...spend, amount: 0n, tokenAddress: '0xusdc', tokenSymbol: 'USDC', notesMerged: 6, notesCreated: 1 }],
]

beforeEach(() => {
  submitRelayMock.mockClear()
  pollMock.mockClear()
  for (const b of Object.values(builders)) b.mockClear()
})

describe.each(CASES)('%s: re-entry with a known hash never re-broadcasts', (_name, handler, kind, meta, artifacts) => {
  it.each(['submit-relayer', 'hub-pending'] as const)('from %s, it re-waits on the relayer status and completes', async (stage) => {
    const upserts: TxRecord[] = []
    const ctx: ExecutorCtx<TxKind> = { signal: new AbortController().signal, upsert: async (r) => { upserts.push(r as TxRecord) } }
    const record = txRecord(kind, meta, {
      id: `resume-${kind}`,
      stage,
      stagesCompleted: stage === 'hub-pending' ? ['build-proof', 'submit-relayer'] : ['build-proof'],
      executionState: 'retrying',
      updatedSeq: 3,
      artifacts: { ...artifacts, sourceTxHash: '0xfeed' },
    } as Partial<TxRecord>)

    await handler.run(record, ctx)

    expect(submitRelayMock).not.toHaveBeenCalled()
    for (const b of Object.values(builders)) expect(b).not.toHaveBeenCalled()
    expect(pollMock).toHaveBeenCalledOnce()
    const last = upserts.at(-1)
    expect(last?.executionState).toBe('completed')
    expect(last?.artifacts.sourceTxHash).toBe('0xfeed')
  })
})
