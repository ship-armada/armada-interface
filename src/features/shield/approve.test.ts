// ABOUTME: Tests for ensureExactAllowance — the direct shield path's USDC approval (both shield kinds): skipped when the
// ABOUTME: allowance already covers the amount; else approve EXACTLY the amount, wait for it, and re-check it before shielding.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const wagmi = vi.hoisted(() => ({ readContract: vi.fn(), writeContract: vi.fn() }))
vi.mock('wagmi/actions', () => wagmi)
vi.mock('@/config/wagmi', () => ({ wagmiConfig: {} }))

const waitForReceiptMock = vi.hoisted(() => vi.fn(async () => ({ status: 'success' })))
vi.mock('@/lib/tx/receipt', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tx/receipt')>()),
  waitForReceiptOrFail: waitForReceiptMock,
}))

import { ensureExactAllowance } from './approve'
import { extractTxError } from '@/lib/tx/receipt'
import type { TxRecord } from '@/lib/tx/types'
import { txRecord } from '@/test/fixtures/txValues'

const TOKEN = '0x2222222222222222222222222222222222222222'
const SPENDER = '0x1111111111111111111111111111111111111111'
const OWNER = '0x3333333333333333333333333333333333333333'

function setup() {
  const upserts: TxRecord[] = []
  const ctx = { signal: new AbortController().signal, upsert: vi.fn(async (r: TxRecord) => { upserts.push(r) }) }
  const record = txRecord('shield', { amount: 5_000_000n, fromChainId: 31337 }, { stage: 'submit-relayer', executionState: 'active', stagesCompleted: ['build-proof'] } as Partial<TxRecord>) as TxRecord<'shield'>
  const run = () => ensureExactAllowance({ record, ctx, token: TOKEN, spender: SPENDER, owner: OWNER, chainId: 31337 })
  return { upserts, run }
}

beforeEach(() => {
  wagmi.readContract.mockReset()
  wagmi.writeContract.mockReset().mockResolvedValue('0xapprove')
  waitForReceiptMock.mockClear()
})

describe('ensureExactAllowance', () => {
  it('skips the approval when the allowance already covers the amount', async () => {
    wagmi.readContract.mockResolvedValue(5_000_000n)
    const { upserts, run } = setup()
    const working = await run()
    expect(wagmi.writeContract).not.toHaveBeenCalled()
    expect((working.artifacts as { approveSkipped?: boolean }).approveSkipped).toBe(true)
    expect(upserts).toHaveLength(1)
  })

  it('approves exactly the amount — not an unlimited allowance — and records it once confirmed', async () => {
    wagmi.readContract.mockResolvedValueOnce(0n).mockResolvedValueOnce(5_000_000n)
    const { run } = setup()
    const working = await run()
    expect(wagmi.writeContract).toHaveBeenCalledWith({}, expect.objectContaining({ functionName: 'approve', args: [SPENDER, 5_000_000n] }))
    expect(waitForReceiptMock).toHaveBeenCalledOnce()
    expect((working.artifacts as { approveTxHash?: string }).approveTxHash).toBe('0xapprove')
  })

  it('stops before the shield when the confirmed allowance is still short (a spend cap lowered in the wallet)', async () => {
    wagmi.readContract.mockResolvedValueOnce(0n).mockResolvedValueOnce(1_000_000n)
    const { run } = setup()
    const caught = await run().catch((err: unknown) => err)
    expect(extractTxError(caught)).toMatchObject({ code: 'PRE_FLIGHT_REVERT' })
    expect(extractTxError(caught)?.message).toMatch(/approve the full amount/)
  })
})
