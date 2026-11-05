// ABOUTME: Tests for the cross-chain shield handler's gasless build step — like the hub shield, it marks the permit
// ABOUTME: signed BETWEEN the permit and intent prompts, so the wallet checklist ticks each row as it's signed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))
vi.mock('@/lib/shielded/keyManager', () => ({
  isUnlocked: () => true,
  getWalletId: () => 'rw-1',
  getShieldedAddress: () => '0zk1example',
}))
vi.mock('@/config/deployments', () => ({
  loadDeployments: async () => ({
    hub: { cctp: { usdc: '0x00000000000000000000000000000000000000a1' }, contracts: { privacyPool: '0x00000000000000000000000000000000000000a2' } },
    clients: [{ chainId: 31338, contracts: { privacyPoolClient: '0x00000000000000000000000000000000000000b1' }, cctp: { usdc: '0x00000000000000000000000000000000000000b2' } }],
  }),
}))
vi.mock('@/lib/network-switch', () => ({ ensureChain: vi.fn(async () => {}) }))

const NOTE = {
  npk: `0x${'11'.repeat(32)}`,
  value: 1n,
  encryptedBundle: [`0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`],
  shieldKey: `0x${'22'.repeat(32)}`,
  random: `0x${'33'.repeat(16)}`,
}
vi.mock('@/lib/shielded/shield-sdk', () => ({ createShieldRequestSdk: vi.fn(async () => NOTE) }))

const signing = vi.hoisted(() => ({
  permit: vi.fn(async () => ({ v: 27, r: `0x${'aa'.repeat(32)}`, s: `0x${'bb'.repeat(32)}` })),
  intent: vi.fn(async () => `0x${'cc'.repeat(65)}`),
}))
vi.mock('@/lib/wallet/permit', () => ({ signUsdcPermit: signing.permit }))
vi.mock('@/lib/wallet/shield-intent', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/wallet/shield-intent')>()),
  readIntentNonce: vi.fn(async () => 0n),
  signCrossChainShieldIntent: signing.intent,
}))

import { shieldXchainHandler } from './handler'
import type { ExecutorCtx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

function gaslessBuildRecord(): TxRecord<'shield-xchain'> {
  return {
    id: 'ulid-xchain',
    kind: 'shield-xchain',
    executionState: 'active',
    stage: 'build-proof',
    stagesCompleted: [],
    updatedSeq: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {
      amount: 10_000_000n,
      feeCacheId: 'c',
      fromChainId: 31338,
      useGasless: true,
      feeAmount: 1_000_000n,
      wrapperAddress: '0x00000000000000000000000000000000000000c1',
      permitDeadline: Math.floor(Date.now() / 1000) + 600,
      broadcasterShieldedAddress: '0zk1relayer',
    },
    artifacts: {},
    walletContext: { evmAddress: '0x00000000000000000000000000000000000000d1', shieldedWalletId: 'rw-1', sourceChainId: 31338 },
  } as unknown as TxRecord<'shield-xchain'>
}

beforeEach(() => {
  signing.permit.mockClear()
  signing.intent.mockClear()
})

describe('shieldXchainHandler gasless build step', () => {
  it('marks the permit signed between the permit and intent prompts, then advances from that record', async () => {
    const upserts: TxRecord[] = []
    const upsert = vi.fn(async (r: TxRecord) => { upserts.push(r) })
    const ctx = { signal: new AbortController().signal, upsert } as unknown as ExecutorCtx<'shield-xchain'>

    await shieldXchainHandler.run(gaslessBuildRecord(), ctx)

    const permitWriteIndex = upserts.findIndex(
      (r) => r.stage === 'build-proof' && (r.artifacts as { permitSigned?: boolean }).permitSigned === true,
    )
    expect(permitWriteIndex).toBeGreaterThanOrEqual(0)
    const permitWriteOrder = upsert.mock.invocationCallOrder[permitWriteIndex]!
    expect(permitWriteOrder).toBeGreaterThan(signing.permit.mock.invocationCallOrder[0]!)
    expect(permitWriteOrder).toBeLessThan(signing.intent.mock.invocationCallOrder[0]!)
    // The advance to submit-relayer builds on that write (a higher seq), so the executor's OCC accepts it.
    const last = upserts.at(-1)!
    expect(last.stage).toBe('submit-relayer')
    expect(last.updatedSeq).toBeGreaterThan(upserts[permitWriteIndex]!.updatedSeq)
  })
})
