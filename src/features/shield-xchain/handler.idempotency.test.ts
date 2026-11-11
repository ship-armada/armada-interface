// ABOUTME: Idempotent re-entry (WS1.3) for the cross-chain shield's submit stage, direct and gasless: a record that already has
// ABOUTME: a sourceTxHash must never re-send the source-chain burn — it finalizes from the known hash (receipt → burn confirmed).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every way the burn could go out again throws: the user's wallet (approve / crossChainShield), a chain switch, the relayer.
const wagmi = vi.hoisted(() => ({
  writeContract: vi.fn(() => { throw new Error('writeContract must not be called on idempotent re-entry') }),
  readContract: vi.fn(() => { throw new Error('readContract must not be called on idempotent re-entry') }),
  sendTransaction: vi.fn(() => { throw new Error('sendTransaction must not be called on idempotent re-entry') }),
  getPublicClient: vi.fn(() => ({ getBlockNumber: async () => 100n })),
}))
vi.mock('wagmi/actions', () => wagmi)
vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
const ensureChainMock = vi.hoisted(() => vi.fn(() => { throw new Error('ensureChain must not be called on idempotent re-entry') }))
vi.mock('@/lib/network-switch', () => ({ ensureChain: ensureChainMock }))
const submitRelayMock = vi.hoisted(() => vi.fn(() => { throw new Error('submitRelay must not be called on idempotent re-entry') }))
vi.mock('@/lib/relayer', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/relayer')>()),
  submitRelay: submitRelayMock,
}))

// Finalizing from the known hash: wait for the source-chain receipt, read its CCTP MessageSent, note the hub's block.
const waitForReceiptMock = vi.hoisted(() => vi.fn(async () => ({ status: 'success', logs: [], blockNumber: 1n })))
vi.mock('@/lib/tx/receipt', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tx/receipt')>()),
  waitForReceiptOrFail: waitForReceiptMock,
}))
vi.mock('@/lib/cctp', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/cctp')>()),
  extractCctpMessageFromReceipt: () => ({ messageHash: '0xmessagehash', nonce: '0xnonce' }),
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: vi.fn(async () => ({
    hub: { contracts: { privacyPool: '0x5555555555555555555555555555555555555555' }, cctp: {} },
    clients: [{ chainId: 31338, cctp: { messageTransmitter: '0x6666666666666666666666666666666666666666' } }],
  })),
}))
vi.mock('@/lib/shielded/keyManager', () => ({ isUnlocked: () => false, getWalletId: () => 'rw-1', getShieldedAddress: () => '0zk1example' }))
vi.mock('@/lib/shielded/sync', () => ({ refreshShieldedBalances: vi.fn(async () => {}) }))

import { shieldXchainHandler } from './handler'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

function recordWithHash(useGasless: boolean): TxRecord<'shield-xchain'> {
  return {
    id: `ulid-shield-xchain-reentry-${useGasless ? 'gasless' : 'direct'}`,
    kind: 'shield-xchain',
    executionState: 'retrying',
    stage: 'submit-relayer',
    stagesCompleted: ['build-proof'],
    updatedSeq: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { amount: 1_000_000n, feeCacheId: 'c', fromChainId: 31338, useGasless, ...(useGasless ? { permitDeadline: 1 } : {}) },
    artifacts: {
      sourceTxHash: '0xfeed',
      privacyPoolClientAddress: '0x7777777777777777777777777777777777777777',
      clientUsdcAddress: '0x2222222222222222222222222222222222222222',
      shieldRequest: { npk: '0x00', value: '1000000', encryptedBundle: ['0x00', '0x00', '0x00'], shieldKey: '0x00' },
    },
    walletContext: { evmAddress: '0xabc', shieldedWalletId: 'rw-1', sourceChainId: 31338 },
  } as TxRecord<'shield-xchain'>
}

describe('shieldXchainHandler submit idempotency (P0-1)', () => {
  beforeEach(() => {
    for (const fn of [wagmi.writeContract, wagmi.readContract, wagmi.sendTransaction, ensureChainMock, submitRelayMock, waitForReceiptMock]) fn.mockClear()
  })

  it.each([
    ['direct', false],
    ['gasless', true],
  ] as const)('%s: re-entering submit-relayer with a known hash finalizes the burn without sending it again', async (_path, useGasless) => {
    const upserts: TxRecord[] = []
    const ctx: ExecutorCtx<'shield-xchain'> = { signal: new AbortController().signal, upsert: async (r) => { upserts.push(r as TxRecord) } }

    await shieldXchainHandler.run(recordWithHash(useGasless), ctx)

    expect(wagmi.writeContract).not.toHaveBeenCalled()
    expect(wagmi.sendTransaction).not.toHaveBeenCalled()
    expect(ensureChainMock).not.toHaveBeenCalled()
    expect(submitRelayMock).not.toHaveBeenCalled()
    expect(waitForReceiptMock).toHaveBeenCalledOnce()
    const last = upserts.at(-1)
    expect(last?.stage).toBe('client-burn-confirmed')
    expect(last?.executionState).not.toBe('failed')
    expect(last?.artifacts.sourceTxHash).toBe('0xfeed')
  })
})
