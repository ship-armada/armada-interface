// ABOUTME: Unit tests for the @armada/sdk history adapter — synthetic-id encoding + historyEntryToTxRecord category mapping.
// ABOUTME: Hand-rolls HistoryEntry fixtures so the mapper is tested purely, without an SDK scan / RPC runtime.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HistoryEntry } from '@armada/sdk'

// Mock the two runtime deps of runHistoryScan so it can be unit-tested without an SDK/RPC. The
// pure mapper + id tests below don't touch these.
const hoisted = vi.hoisted(() => ({
  readSdkHistory: vi.fn(async (): Promise<HistoryEntry[]> => []),
  getHubBlockTimestamps: vi.fn(async () => new Map<number, number>()),
}))
vi.mock('./sdk-read', () => ({ readSdkHistory: hoisted.readSdkHistory }))
vi.mock('./network', () => ({ getHubBlockTimestamps: hoisted.getHubBlockTimestamps }))

import { historyEntryToTxRecord, isSyntheticTxId, runHistoryScan, syntheticTxId } from './history'

describe('syntheticTxId / isSyntheticTxId', () => {
  it('encodes txid + category', () => {
    // WHY: the id is the idempotency key for OCC. Two scans seeing the same txid+category
    // produce the same id, so re-runs are no-ops at the storage layer.
    expect(syntheticTxId('abc', 'ShieldERC20s')).toBe('synth:abc:ShieldERC20s')
  })
  it('distinguishes synthetic from authored ids', () => {
    // WHY: future code (incoming-transfer detector, UI affordances) needs a cheap classifier
    // to tell "I authored this" (ulid) from "recovered from chain" (synth:*).
    expect(isSyntheticTxId(syntheticTxId('abc', 'ShieldERC20s'))).toBe(true)
    expect(isSyntheticTxId('01J5XYZULID0001')).toBe(false)
  })
})

// The mapper's USDC gate matches by token ADDRESS. USDC_ADDR is the fixture default; SHARE_ADDR is a
// distinct (non-USDC) token — e.g. the yield-vault share token — used to exercise the filter.
const USDC_ADDR = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const SHARE_ADDR = '0x5ba1e12693dc8f9c48aad8770482f4739beed696'
const SDK_CTX = { hubChainId: 31337, usdcAddress: USDC_ADDR }
const sdkEntry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  txid: '0xabc',
  blockNumber: 100,
  category: 'shield',
  tokenHash: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000',
  tokenAddress: USDC_ADDR,
  value: 1_000_000n,
  ...over,
})

describe('historyEntryToTxRecord (@armada/sdk read path)', () => {
  it('shield → shield, amount includes the shield fee', () => {
    const r = historyEntryToTxRecord(sdkEntry({ category: 'shield', value: 995_000n, shieldFee: 5_000n }), 'w', SDK_CTX, 5000)
    expect(r).toMatchObject({ kind: 'shield', id: 'synth:0xabc:shield', createdAt: 5000, meta: { amount: 1_000_000n } })
  })

  it('transfer-sent → transfer-shielded, recipient + broadcaster fee split from sentOutputs', () => {
    const r = historyEntryToTxRecord(
      sdkEntry({ category: 'transfer-sent', value: -500_000n, broadcasterFee: 20_000n, broadcasterShieldedAddress: '0zk_relayer', sentOutputs: [{ recipientShieldedAddress: '0zk_bob', value: 480_000n }] }),
      'w', SDK_CTX, 5000,
    )
    // #42: the recovered broadcaster 0zk address is threaded through (was hardcoded '').
    expect(r).toMatchObject({ kind: 'transfer-shielded', meta: { amount: 480_000n, broadcasterFeeAmount: 20_000n, recipient: '0zk_bob', broadcasterShieldedAddress: '0zk_relayer' } })
  })

  it('self-transfer → transfer-shielded with amount = fee, not a phantom outgoing (#39)', () => {
    // The pre-#88 SDK misclassified a send-to-self as a big negative transfer-sent (the "−194" bug).
    // Now it is a distinct `self-transfer` (value = −fee); the record must NOT be dropped and its
    // amount is the fee (net cost), so the balance-from-history fallback debits the fee only.
    const r = historyEntryToTxRecord(
      sdkEntry({ category: 'self-transfer', value: -1_500n, broadcasterFee: 1_500n, broadcasterShieldedAddress: '0zk_relayer', sentOutputs: [{ recipientShieldedAddress: '0zk_self', value: 0n }] }),
      'w', SDK_CTX, 5000,
    )
    expect(r).toMatchObject({
      kind: 'transfer-shielded',
      id: 'synth:0xabc:self-transfer',
      meta: { amount: 1_500n, recipient: '0zk_self', broadcasterFeeAmount: 1_500n, broadcasterShieldedAddress: '0zk_relayer' },
    })
  })

  it('gasless shield surfaces the recovered broadcaster fee (#43)', () => {
    const r = historyEntryToTxRecord(
      sdkEntry({ category: 'shield', value: 990_000n, shieldFee: 5_000n, broadcasterFee: 5_000n, broadcasterShieldedAddress: '0zk_relayer' }),
      'w', SDK_CTX, 5000,
    )
    expect(r).toMatchObject({ kind: 'shield', meta: { amount: 995_000n, useGasless: true, feeAmount: 5_000n, broadcasterShieldedAddress: '0zk_relayer' } })
  })

  it('a direct (non-gasless) shield carries no feeAmount / useGasless (#43)', () => {
    const r = historyEntryToTxRecord(sdkEntry({ category: 'shield', value: 995_000n, shieldFee: 5_000n }), 'w', SDK_CTX, 5000)
    expect(r!.meta).not.toHaveProperty('feeAmount')
    expect(r!.meta).not.toHaveProperty('useGasless')
  })

  it('transfer-received → received, memo passed through', () => {
    const r = historyEntryToTxRecord(sdkEntry({ category: 'transfer-received', value: 250_000n, memo: 'hi' }), 'w', SDK_CTX, 5000)
    expect(r).toMatchObject({ kind: 'transfer-shielded-received', meta: { amount: 250_000n, memoText: 'hi' } })
  })

  it('unshield → unshield-local, recipient + net amount (minus fees)', () => {
    const r = historyEntryToTxRecord(sdkEntry({ category: 'unshield', value: -500_000n, broadcasterFee: 10_000n, unshieldFee: 2_500n, recipient: '0xrecipient' }), 'w', SDK_CTX, 5000)
    expect(r).toMatchObject({ kind: 'unshield-local', meta: { amount: 487_500n, recipient: '0xrecipient', broadcasterFeeAmount: 10_000n } })
  })

  it('yield deposit + withdraw map natively (no adapter heuristic)', () => {
    expect(historyEntryToTxRecord(sdkEntry({ category: 'yield-deposit', value: -900_000n }), 'w', SDK_CTX, 5000)).toMatchObject({ kind: 'yield-deposit', meta: { amount: 900_000n } })
    expect(historyEntryToTxRecord(sdkEntry({ category: 'yield-withdraw', value: 950_000n }), 'w', SDK_CTX, 5000)).toMatchObject({ kind: 'yield-withdraw', meta: { amount: 950_000n } })
  })

  it('drops the share leg of a two-leg yield op, keeping only the USDC leg (#40)', () => {
    // Post-armada-sdk #91 a yield op emits a USDC leg + a share leg sharing one (txid, category).
    // Both would collide on the same synthetic id; the USDC gate drops the share leg so the surviving
    // record is the USDC one (a deposit could otherwise display `+shares` as its amount).
    const usdcLeg = historyEntryToTxRecord(sdkEntry({ category: 'yield-deposit', value: -500_000n, tokenAddress: USDC_ADDR }), 'w', SDK_CTX, 5000)
    const shareLeg = historyEntryToTxRecord(sdkEntry({ category: 'yield-deposit', value: 12_000n, tokenAddress: SHARE_ADDR }), 'w', SDK_CTX, 5000)
    expect(usdcLeg).toMatchObject({ kind: 'yield-deposit', meta: { amount: 500_000n } })
    expect(shareLeg).toBeNull()
  })

  it('repopulates recoverable meta (feeCacheId + useWalletOverride) from entry.selfMetadata (#44)', () => {
    const r = historyEntryToTxRecord(
      sdkEntry({ category: 'unshield', value: -500_000n, recipient: '0xrecipient', selfMetadata: JSON.stringify({ v: 1, c: 'quote-77', w: 1 }) }),
      'w', SDK_CTX, 5000,
    )
    expect(r).toMatchObject({ kind: 'unshield-local', meta: { feeCacheId: 'quote-77', useWalletOverride: true } })
  })

  it('leaves feeCacheId empty + omits useWalletOverride when no selfMetadata was recovered (#44)', () => {
    const r = historyEntryToTxRecord(sdkEntry({ category: 'unshield', value: -500_000n, recipient: '0xr' }), 'w', SDK_CTX, 5000)
    expect(r!.meta).toMatchObject({ feeCacheId: '' })
    expect(r!.meta).not.toHaveProperty('useWalletOverride')
  })

  it('filters non-USDC entries so they never render mis-denominated as USDC (#41)', () => {
    // A plain receive of a non-USDC token (e.g. vault shares sent directly) must not map to a USDC row.
    expect(historyEntryToTxRecord(sdkEntry({ category: 'transfer-received', value: 5_000n, tokenAddress: SHARE_ADDR }), 'w', SDK_CTX, 5000)).toBeNull()
    // USDC still maps.
    expect(historyEntryToTxRecord(sdkEntry({ category: 'transfer-received', value: 5_000n, tokenAddress: USDC_ADDR }), 'w', SDK_CTX, 5000)).toMatchObject({ kind: 'transfer-shielded-received' })
  })

  it('matches USDC case-insensitively and fails open when the USDC address is unresolved (#41)', () => {
    // A checksummed entry address must still match the lowercase config address.
    const mixed = historyEntryToTxRecord(sdkEntry({ category: 'shield', tokenAddress: USDC_ADDR.toUpperCase() as `0x${string}` }), 'w', SDK_CTX, 5000)
    expect(mixed).toMatchObject({ kind: 'shield' })
    // FAIL-OPEN: an unresolved USDC address (ctx '') keeps everything rather than wiping history.
    const failOpen = historyEntryToTxRecord(sdkEntry({ category: 'transfer-received', value: 5_000n, tokenAddress: SHARE_ADDR }), 'w', { hubChainId: 31337, usdcAddress: '' }, 5000)
    expect(failOpen).toMatchObject({ kind: 'transfer-shielded-received' })
  })

  it('stamps walletContext: shieldedWalletId + hub chain, undefined evmAddress', () => {
    // WHY: TxWalletContext allows undefined evmAddress for shielded-only ops. We don't fabricate an
    // EVM binding for historical records because the user may have switched EVMs since.
    const r = historyEntryToTxRecord(sdkEntry({ category: 'shield' }), 'w', SDK_CTX, 5000)
    expect(r!.walletContext).toEqual({ evmAddress: undefined, shieldedWalletId: 'w', sourceChainId: 31337 })
  })
})

describe('runHistoryScan (@armada/sdk scan)', () => {
  beforeEach(() => {
    hoisted.readSdkHistory.mockReset()
    hoisted.getHubBlockTimestamps.mockReset()
    hoisted.getHubBlockTimestamps.mockResolvedValue(new Map())
  })

  it('maps entries, backfills block timestamps, and reports the highest block as the checkpoint', async () => {
    // WHY: the checkpoint must be the MAX block seen (the resume point); a min/first bug silently
    // skips rows on the next incremental scan. Timestamps come from a bulk block lookup because the
    // SDK doesn't stamp every chain — without it rows render the Unix epoch ("Dec 31, 1969").
    hoisted.readSdkHistory.mockResolvedValue([
      sdkEntry({ txid: 'a', blockNumber: 100_001, value: 1n }),
      sdkEntry({ txid: 'b', blockNumber: 100_005, value: 2n }),
      sdkEntry({ txid: 'c', blockNumber: 100_003, value: 3n }),
    ])
    hoisted.getHubBlockTimestamps.mockResolvedValue(new Map([
      [100_001, 1_700_000_000],
      [100_005, 1_700_000_300],
      [100_003, 1_700_000_150],
    ]))
    const result = await runHistoryScan('w', SDK_CTX, 100_000)
    expect(hoisted.readSdkHistory).toHaveBeenCalledWith(100_000)
    expect(result.highestBlock).toBe(100_005)
    expect(result.itemCount).toBe(3)
    // Sorted by updatedAt (=timestamp) descending, so the latest-block row is first.
    expect(result.records.map(r => r.createdAt)).toEqual([
      1_700_000_300_000, 1_700_000_150_000, 1_700_000_000_000,
    ])
  })

  it('leaves createdAt at 0 for entries whose block timestamp is unavailable (graceful degrade)', async () => {
    // WHY: a flaky RPC shouldn't crash the scan — the row still renders, just sorted to the bottom
    // with the epoch default. Strictly better than failing the whole recovery for the user.
    hoisted.readSdkHistory.mockResolvedValue([sdkEntry({ txid: 'a', blockNumber: 100_001, value: 1n })])
    hoisted.getHubBlockTimestamps.mockResolvedValue(new Map())
    const result = await runHistoryScan('w', SDK_CTX, undefined)
    expect(result.records[0]!.createdAt).toBe(0)
  })

  it('skips the block-timestamp lookup entirely when the scan is empty', async () => {
    // WHY: no entries → no blocks → no reason to pay for an RPC round-trip.
    hoisted.readSdkHistory.mockResolvedValue([])
    const result = await runHistoryScan('w', SDK_CTX, undefined)
    expect(hoisted.getHubBlockTimestamps).not.toHaveBeenCalled()
    expect(result).toEqual({ records: [], highestBlock: null, itemCount: 0 })
  })
})
