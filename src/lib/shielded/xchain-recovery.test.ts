// ABOUTME: Unit tests for buildXchainCctpMap — candidate selection (every shield + every unshield) and
// ABOUTME: fetch/parse orchestration into the txid→routing map. Provider + CCTP parser are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  getTransactionReceipt: vi.fn(),
  readCctpFromLogs: vi.fn(),
}))
vi.mock('./network', () => ({ timeoutProvider: () => ({ getTransactionReceipt: hoisted.getTransactionReceipt }) }))
vi.mock('../cctp', () => ({ readCctpFromLogs: hoisted.readCctpFromLogs }))

import { buildXchainCctpMap } from './xchain-recovery'

beforeEach(() => {
  hoisted.getTransactionReceipt.mockReset()
  hoisted.readCctpFromLogs.mockReset()
  // Receipt logs carry a marker so the parser mock can key off the txid it was fetched for.
  hoisted.getTransactionReceipt.mockImplementation(async (hash: string) => ({ logs: [{ hash }] }))
  hoisted.readCctpFromLogs.mockImplementation(({ logs }: { logs: Array<{ hash: string }> }) => {
    const hash = logs[0]!.hash
    if (hash === '0xshieldtx') return { received: { sourceDomain: 101, burnAmount: 3_000_000n, cctpFee: 25_000n } }
    if (hash === '0xunshieldtx') return { sent: { destinationDomain: 102, mintRecipient: '0xrec', maxFee: 1_200n } }
    return {}
  })
})

describe('buildXchainCctpMap', () => {
  it('maps shields (source) + unshields (destination) by the CCTP event in their hub tx, skipping non-candidates', async () => {
    const map = await buildXchainCctpMap({
      entries: [
        { txid: 'shieldtx', category: 'shield' },
        // A cross-chain exit's Unshield event names the FINAL recipient (TransactModule), so the recipient can't
        // tell it apart from a local unshield — only the CCTP message in its tx can (#72).
        { txid: 'unshieldtx', category: 'unshield', recipient: '0xEOA' },
        { txid: 'unshieldlocal', category: 'unshield', recipient: '0xEOA' }, // no CCTP message → stays local
        { txid: 'transfertx', category: 'transfer-sent' }, // not a candidate
      ] as never,
      transmitterAddress: '0xtransmitter',
      hubRpcUrl: 'http://hub',
    })
    // Shield candidate carries the true deposit (burnAmount) + actual CCTP fee recovered from the mint.
    expect(map.get('shieldtx')).toEqual({ sourceDomain: 101, burnAmount: 3_000_000n, cctpFee: 25_000n })
    // Unshield candidate carries its destination and the CCTP maxFee the tx bound (the estimate × 2, see
    // cctpMaxFeeForKind) — not the message's mintRecipient, which is the destination pool, not the user.
    expect(map.get('unshieldtx')).toEqual({ destinationDomain: 102, maxFee: 1_200n })
    expect(map.has('unshieldlocal')).toBe(false)
    expect(map.has('transfertx')).toBe(false)
    // Every shield and unshield was fetched; the transfer wasn't.
    expect(hoisted.getTransactionReceipt).toHaveBeenCalledTimes(3)
  })

  it('returns an empty map (no fetches) when there are no candidates', async () => {
    const map = await buildXchainCctpMap({
      entries: [{ txid: 'a', category: 'transfer-received' }] as never,
      transmitterAddress: '0xt', hubRpcUrl: 'http://hub',
    })
    expect(map.size).toBe(0)
    expect(hoisted.getTransactionReceipt).not.toHaveBeenCalled()
  })

  it('best-effort: a failed receipt fetch leaves that txid unmapped', async () => {
    hoisted.getTransactionReceipt.mockRejectedValueOnce(new Error('rpc down'))
    const map = await buildXchainCctpMap({
      entries: [{ txid: 'shieldtx', category: 'shield' }] as never,
      transmitterAddress: '0xt', hubRpcUrl: 'http://hub',
    })
    expect(map.size).toBe(0)
  })
})
