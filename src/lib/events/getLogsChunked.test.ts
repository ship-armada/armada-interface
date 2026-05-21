// ABOUTME: Tests for getLogsChunked — verifies block-window chunking, 'latest' resolution, abort handling, and onChunk progress.
// ABOUTME: Uses a fake getLogs that records each requested window and returns synthetic logs keyed by block number.

import { describe, it, expect, vi } from 'vitest'
import { getLogsChunked, type ChunkedLogsClient } from './getLogsChunked'

interface FakeLog {
  blockNumber: bigint
  fromBlockSeen: bigint
  toBlockSeen: bigint
}

function makeClient(opts: {
  latest: bigint
  logsAtBlocks: bigint[]
}): { client: ChunkedLogsClient<FakeLog>; calls: Array<{ from: bigint; to: bigint }> } {
  const calls: Array<{ from: bigint; to: bigint }> = []
  const client: ChunkedLogsClient<FakeLog> = {
    async getBlockNumber() {
      return opts.latest
    },
    async getLogs({ fromBlock, toBlock }) {
      calls.push({ from: fromBlock, to: toBlock })
      return opts.logsAtBlocks
        .filter(b => b >= fromBlock && b <= toBlock)
        .map(b => ({ blockNumber: b, fromBlockSeen: fromBlock, toBlockSeen: toBlock }))
    },
  }
  return { client, calls }
}

describe('getLogsChunked', () => {
  it('splits range into windows of maxRange blocks (inclusive)', async () => {
    const { client, calls } = makeClient({ latest: 100n, logsAtBlocks: [] })
    await getLogsChunked(client, { fromBlock: 0n, toBlock: 10n, maxRange: 3, query: () => ({}) })

    // 0..2, 3..5, 6..8, 9..10
    expect(calls).toEqual([
      { from: 0n, to: 2n },
      { from: 3n, to: 5n },
      { from: 6n, to: 8n },
      { from: 9n, to: 10n },
    ])
  })

  it('resolves toBlock="latest" via getBlockNumber once', async () => {
    const { client, calls } = makeClient({ latest: 42n, logsAtBlocks: [] })
    const getBlockSpy = vi.spyOn(client, 'getBlockNumber')

    await getLogsChunked(client, { fromBlock: 40n, toBlock: 'latest', maxRange: 100, query: () => ({}) })

    expect(getBlockSpy).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([{ from: 40n, to: 42n }])
  })

  it('returns an empty array when fromBlock > toBlock (no chunk issued)', async () => {
    const { client, calls } = makeClient({ latest: 5n, logsAtBlocks: [] })

    const out = await getLogsChunked(client, { fromBlock: 10n, toBlock: 5n, maxRange: 100, query: () => ({}) })

    expect(out).toEqual([])
    expect(calls).toEqual([])
  })

  it('issues a single chunk when range fits within maxRange', async () => {
    const { client, calls } = makeClient({ latest: 1000n, logsAtBlocks: [50n] })

    const out = await getLogsChunked(client, { fromBlock: 0n, toBlock: 100n, maxRange: 5000, query: () => ({}) })

    expect(calls).toEqual([{ from: 0n, to: 100n }])
    expect(out).toHaveLength(1)
    expect(out[0]!.blockNumber).toBe(50n)
  })

  it('concatenates results across chunks in order', async () => {
    const { client } = makeClient({ latest: 100n, logsAtBlocks: [1n, 4n, 7n, 10n] })

    const out = await getLogsChunked(client, { fromBlock: 0n, toBlock: 10n, maxRange: 3, query: () => ({}) })

    expect(out.map(l => l.blockNumber)).toEqual([1n, 4n, 7n, 10n])
  })

  it('aborts mid-flight when the signal fires', async () => {
    const { client, calls } = makeClient({ latest: 100n, logsAtBlocks: [] })
    const controller = new AbortController()

    // Trip the abort after the first chunk completes.
    const originalGetLogs = client.getLogs.bind(client)
    client.getLogs = async args => {
      const r = await originalGetLogs(args)
      if (calls.length === 1) controller.abort()
      return r
    }

    await expect(
      getLogsChunked(client, {
        fromBlock: 0n,
        toBlock: 10n,
        maxRange: 3,
        query: () => ({}),
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i)

    // Verify we stopped early — only the first chunk should have completed.
    expect(calls).toHaveLength(1)
  })

  it('invokes onChunk after each completed window with the inclusive end block', async () => {
    const { client } = makeClient({ latest: 100n, logsAtBlocks: [] })
    const seen: bigint[] = []

    await getLogsChunked(client, {
      fromBlock: 0n,
      toBlock: 10n,
      maxRange: 3,
      query: () => ({}),
      onChunk: ({ toBlockInclusive }) => { seen.push(toBlockInclusive) },
    })

    expect(seen).toEqual([2n, 5n, 8n, 10n])
  })

  it('throws when maxRange < 1', async () => {
    const { client } = makeClient({ latest: 10n, logsAtBlocks: [] })

    await expect(
      getLogsChunked(client, { fromBlock: 0n, toBlock: 5n, maxRange: 0, query: () => ({}) }),
    ).rejects.toThrow(/maxRange/)
  })
})
