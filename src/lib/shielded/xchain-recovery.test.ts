// ABOUTME: Unit tests for buildXchainCctpMap — candidate selection (shields + unshields-to-pool) and
// ABOUTME: fetch/parse orchestration into the txid→routing map. Provider + CCTP parser are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  getTransactionReceipt: vi.fn(),
  readCctpFromLogs: vi.fn(),
}))
vi.mock('./network', () => ({ timeoutProvider: () => ({ getTransactionReceipt: hoisted.getTransactionReceipt }) }))
vi.mock('../cctp', () => ({ readCctpFromLogs: hoisted.readCctpFromLogs }))

import { buildXchainCctpMap } from './xchain-recovery'

const POOL = '0xPOOL00000000000000000000000000000000abcd'

beforeEach(() => {
  hoisted.getTransactionReceipt.mockReset()
  hoisted.readCctpFromLogs.mockReset()
  // Receipt logs carry a marker so the parser mock can key off the txid it was fetched for.
  hoisted.getTransactionReceipt.mockImplementation(async (hash: string) => ({ logs: [{ hash }] }))
  hoisted.readCctpFromLogs.mockImplementation(({ logs }: { logs: Array<{ hash: string }> }) => {
    const hash = logs[0]!.hash
    if (hash === '0xshieldtx') return { received: { sourceDomain: 101, burnAmount: 3_000_000n, cctpFee: 25_000n } }
    if (hash === '0xunshieldtx') return { sent: { destinationDomain: 102, mintRecipient: '0xrec' } }
    return {}
  })
})

describe('buildXchainCctpMap', () => {
  it('maps shields (source) + unshields-to-pool (destination), skipping non-candidates', async () => {
    const map = await buildXchainCctpMap({
      entries: [
        { txid: 'shieldtx', category: 'shield' },
        { txid: 'unshieldtx', category: 'unshield', recipient: POOL },
        { txid: 'unshieldeoa', category: 'unshield', recipient: '0xEOA' }, // to an EOA → not cross-chain
        { txid: 'transfertx', category: 'transfer-sent' }, // not a candidate
      ] as never,
      poolAddress: POOL,
      transmitterAddress: '0xtransmitter',
      hubRpcUrl: 'http://hub',
    })
    // Shield candidate carries the true deposit (burnAmount) + actual CCTP fee recovered from the mint.
    expect(map.get('shieldtx')).toEqual({ sourceDomain: 101, burnAmount: 3_000_000n, cctpFee: 25_000n })
    expect(map.get('unshieldtx')).toEqual({ destinationDomain: 102, recipient: '0xrec' })
    expect(map.has('unshieldeoa')).toBe(false)
    expect(map.has('transfertx')).toBe(false)
    // Only the two candidates were fetched.
    expect(hoisted.getTransactionReceipt).toHaveBeenCalledTimes(2)
  })

  it('returns an empty map (no fetches) when there are no candidates', async () => {
    const map = await buildXchainCctpMap({
      entries: [{ txid: 'a', category: 'transfer-received' }] as never,
      poolAddress: POOL, transmitterAddress: '0xt', hubRpcUrl: 'http://hub',
    })
    expect(map.size).toBe(0)
    expect(hoisted.getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('best-effort: a failed receipt fetch leaves that txid unmapped', async () => {
    hoisted.getTransactionReceipt.mockRejectedValueOnce(new Error('rpc down'))
    const map = await buildXchainCctpMap({
      entries: [{ txid: 'shieldtx', category: 'shield' }] as never,
      poolAddress: POOL, transmitterAddress: '0xt', hubRpcUrl: 'http://hub',
    })
    expect(map.size).toBe(0)
  })
})
