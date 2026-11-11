// ABOUTME: Unit tests for the eth_getLogs bisecting patch.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JsonRpcProvider, type JsonRpcResult } from 'ethers'
import {
  installBisectingGetLogs,
  _isBisectingGetLogsPatched,
  _uninstallBisectingGetLogs,
  _bisectEthGetLogs,
  _isBlockRangeError,
} from './rpc-bisecting'

beforeEach(() => {
  _uninstallBisectingGetLogs()
})

afterEach(() => {
  _uninstallBisectingGetLogs()
})

describe('isBlockRangeError', () => {
  it('matches the Alchemy free-tier "10 block range" message', () => {
    const err = new Error('Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.')
    expect(_isBlockRangeError(err)).toBe(true)
  })

  it('matches Infura "more than X results" wording', () => {
    const err = new Error('query returned more than 10000 results')
    expect(_isBlockRangeError(err)).toBe(true)
  })

  it('matches QuickNode "limited to a X block range" wording', () => {
    const err = new Error('eth_getLogs is limited to a 1000 block range')
    expect(_isBlockRangeError(err)).toBe(true)
  })

  it('digs into ethers SERVER_ERROR shape (info.responseBody)', () => {
    const err = {
      code: 'SERVER_ERROR',
      message: 'server response 400',
      info: {
        responseBody: '{"error":{"message":"Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range"}}',
      },
    }
    expect(_isBlockRangeError(err)).toBe(true)
  })

  it('does NOT match unrelated errors (timeouts, reverts)', () => {
    expect(_isBlockRangeError(new Error('CALL_EXCEPTION: execution reverted'))).toBe(false)
    expect(_isBlockRangeError(new Error('timeout'))).toBe(false)
    expect(_isBlockRangeError(null)).toBe(false)
    expect(_isBlockRangeError(undefined)).toBe(false)
  })
})

describe('bisectEthGetLogs', () => {
  it('passes through a successful call without splitting', async () => {
    const expected = [{ blockNumber: 100 }]
    const send = vi.fn().mockResolvedValueOnce(expected)
    const result = await _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0x100' }, 0)
    expect(result).toEqual(expected)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('bisects once on a range-too-large error and merges the halves', async () => {
    const err = new Error('eth_getLogs is limited to a 10 block range')
    // First call (full range 0..100) errors, then two halves (0..50, 51..100) succeed.
    const send = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce([{ blockNumber: 10 }])
      .mockResolvedValueOnce([{ blockNumber: 80 }])
    const result = await _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0x64' }, 0)
    expect(result).toEqual([{ blockNumber: 10 }, { blockNumber: 80 }])
    expect(send).toHaveBeenCalledTimes(3)
    // Verify the recursive halves
    expect(send.mock.calls[1]?.[1]).toEqual([{ fromBlock: '0x0', toBlock: '0x32' }])
    expect(send.mock.calls[2]?.[1]).toEqual([{ fromBlock: '0x33', toBlock: '0x64' }])
  })

  it('recurses multiple levels when the first bisection is still too large', async () => {
    const err = new Error('block range too wide')
    // Top: [0, 100] fails. Left half [0, 50] still fails. Quarter halves succeed.
    // Right half [51, 100] succeeds on first try.
    const send = vi.fn()
      .mockRejectedValueOnce(err) //  [0, 100] full
      .mockRejectedValueOnce(err) //  [0, 50] left
      .mockResolvedValueOnce([1]) // [0, 25] left-left
      .mockResolvedValueOnce([2]) // [26, 50] left-right
      .mockResolvedValueOnce([3]) // [51, 100] right
    const result = await _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0x64' }, 0)
    expect(result).toEqual([1, 2, 3])
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('propagates non-range errors without splitting', async () => {
    const err = new Error('CALL_EXCEPTION: execution reverted')
    const send = vi.fn().mockRejectedValueOnce(err)
    await expect(
      _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0x100' }, 0),
    ).rejects.toThrow('execution reverted')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('propagates the range error when the range is already a single block', async () => {
    const err = new Error('block range too wide')
    const send = vi.fn().mockRejectedValueOnce(err)
    await expect(
      _bisectEthGetLogs(send, { fromBlock: '0x10', toBlock: '0x10' }, 0),
    ).rejects.toThrow('block range too wide')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not infinite-recurse on a pathological range (single-block branch wins in practice)', async () => {
    const err = new Error('block range too wide')
    const send = vi.fn().mockRejectedValue(err)
    // Range is 0..0xFFFFFF (16M blocks). Bisection halves until it hits a single-block range,
    // which is the operative cap below MAX_BISECT_DEPTH (16M < 2^25, so single-block fires
    // before depth). Original error propagates unwrapped — that path is informative enough.
    await expect(
      _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0xFFFFFF' }, 0),
    ).rejects.toThrow(/block range too wide/)
    expect(send.mock.calls.length).toBeLessThan(400)
  })

  it('wraps the original error with range + depth context when MAX_BISECT_DEPTH fires', async () => {
    const err = new Error('block range too wide')
    const send = vi.fn().mockRejectedValue(err)
    // Start the recursion near the depth limit so the depth-cap branch fires before the
    // single-block branch can. Range is large enough that subdivision is still meaningful.
    await expect(
      _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0xFFFFFFFF' }, 24),
    ).rejects.toThrow(/bisection exceeded max depth/)
    await expect(
      _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0xFFFFFFFF' }, 24),
    ).rejects.toThrow(/block range too wide/)
  })

  it('preserves filter fields other than fromBlock/toBlock', async () => {
    const err = new Error('block range too wide')
    const filter = {
      fromBlock: '0x0',
      toBlock: '0x100',
      address: '0xabc',
      topics: ['0xtopic1', null],
    }
    const send = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    await _bisectEthGetLogs(send, filter, 0)
    const leftCall = send.mock.calls[1]?.[1]?.[0] as Record<string, unknown>
    expect(leftCall.address).toBe('0xabc')
    expect(leftCall.topics).toEqual(['0xtopic1', null])
  })
})

describe('installBisectingGetLogs', () => {
  it('is idempotent', () => {
    expect(_isBisectingGetLogsPatched()).toBe(false)
    installBisectingGetLogs()
    expect(_isBisectingGetLogsPatched()).toBe(true)
    installBisectingGetLogs()
    installBisectingGetLogs()
    expect(_isBisectingGetLogsPatched()).toBe(true)
  })

  it('splits a rejected eth_getLogs range through a real provider, and passes other methods straight through', async () => {
    // WHY: stub the transport UNDER the patch (ethers' _send, which carries the JSON-RPC payloads). Spying on
    // provider.send itself would replace the patched method and pass with no patch installed.
    installBisectingGetLogs()
    const provider = new JsonRpcProvider('http://localhost:0', 1, { staticNetwork: true, batchMaxCount: 1 })
    const sent: { method: string; params: unknown[] }[] = []
    // ethers types _send's result as success-only; an RPC error item is just as valid at runtime.
    const respond = (items: unknown[]): JsonRpcResult[] => items as JsonRpcResult[]
    vi.spyOn(provider, '_send').mockImplementation(async (payload) => {
      const { id, method, params } = (Array.isArray(payload) ? payload[0] : payload) as { id: number; method: string; params: unknown[] }
      sent.push({ method, params })
      if (method !== 'eth_getLogs') return respond([{ id, result: '0x10' }])
      const { fromBlock, toBlock } = params[0] as { fromBlock: string; toBlock: string }
      if (Number(toBlock) - Number(fromBlock) > 0x8) {
        return respond([{ id, error: { code: -32005, message: 'eth_getLogs block range is too large' } }])
      }
      return respond([{ id, result: [{ fromBlock, toBlock }] }])
    })

    expect(await provider.send('eth_blockNumber', [])).toBe('0x10')
    expect(sent).toEqual([{ method: 'eth_blockNumber', params: [] }])

    const logs = await provider.send('eth_getLogs', [{ fromBlock: '0x0', toBlock: '0x10' }])
    // One rejected request for the whole range, then its two halves; the halves' logs are merged in order.
    expect(sent.slice(1).map((c) => c.params[0])).toEqual([
      { fromBlock: '0x0', toBlock: '0x10' },
      { fromBlock: '0x0', toBlock: '0x8' },
      { fromBlock: '0x9', toBlock: '0x10' },
    ])
    expect(logs).toEqual([{ fromBlock: '0x0', toBlock: '0x8' }, { fromBlock: '0x9', toBlock: '0x10' }])
  })
})
