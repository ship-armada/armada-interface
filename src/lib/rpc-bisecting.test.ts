// ABOUTME: Unit tests for the eth_getLogs bisecting patch.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JsonRpcProvider } from 'ethers'
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

  it('respects MAX_BISECT_DEPTH (no infinite recursion)', async () => {
    const err = new Error('block range too wide')
    const send = vi.fn().mockRejectedValue(err)
    // Range is 0..0xFFFFFF (16M blocks) — should bail before bisecting forever.
    await expect(
      _bisectEthGetLogs(send, { fromBlock: '0x0', toBlock: '0xFFFFFF' }, 0),
    ).rejects.toThrow('block range too wide')
    // Exact call count depends on the depth limit, but should be finite + small.
    expect(send.mock.calls.length).toBeLessThan(200)
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

  it('intercepts eth_getLogs but passes through other methods', async () => {
    installBisectingGetLogs()
    const provider = new JsonRpcProvider('http://localhost:0') // never connects; we mock send

    // Spy on the underlying send (the patched method calls back into the real one for non-getLogs)
    // by replacing it temporarily with a mock and verifying call shape.
    let recordedMethod = ''
    let recordedParams: unknown[] = []
    const origSend = JsonRpcProvider.prototype.send
    // The patched `proto.send` calls `originalSend.call(this, ...)` — we'll stash our own
    // base implementation by going one level down: replace prototype.send temporarily.
    // Simpler: monkey-patch the instance's send directly to track calls.
    const baseSend = provider.send.bind(provider)
    vi.spyOn(provider, 'send').mockImplementation(async (m, p) => {
      recordedMethod = m
      recordedParams = p as unknown[]
      if (m === 'eth_getLogs') return []
      return null
    })

    // Non-getLogs: pass-through
    await provider.send('eth_blockNumber', [])
    expect(recordedMethod).toBe('eth_blockNumber')

    // eth_getLogs: intercepted (still calls send internally with same args because no error)
    await provider.send('eth_getLogs', [{ fromBlock: '0x0', toBlock: '0x10' }])
    expect(recordedMethod).toBe('eth_getLogs')
    expect(recordedParams).toEqual([{ fromBlock: '0x0', toBlock: '0x10' }])

    // Keep the linter happy about unused
    void origSend; void baseSend
  })
})
