// ABOUTME: Unit tests for ensureChain — direct-EIP-1193 switching, post-switch settle loop, user-rejection + chain-not-added wrapping.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted mocks so `vi.mock` factories below can reference them.
const { getAccountMock } = vi.hoisted(() => ({
  getAccountMock: vi.fn(),
}))

vi.mock('wagmi/actions', () => ({
  getAccount: getAccountMock,
}))

vi.mock('@/config/wagmi', () => ({
  wagmiConfig: { _mock: true },
}))

vi.mock('@/config/network', () => ({
  getChainById: (id: number) => {
    if (id === 11155111) return { chainId: 11155111, name: 'Ethereum Sepolia' }
    if (id === 84532) return { chainId: 84532, name: 'Base Sepolia' }
    return undefined
  },
}))

import { ensureChain, _isUserRejection, _isChainNotAdded } from './network-switch'

beforeEach(() => {
  getAccountMock.mockReset()
})

/**
 * Build a connected-account stub with a connector that exposes:
 *  - `getChainId()` returning a queue of chainIds (one per call). The first call is the
 *    pre-switch read; subsequent calls are the post-switch settle loop polls.
 *  - `getProvider()` returning an EIP-1193 provider whose `request` is `requestMock`.
 *
 * Once the queue is exhausted the last value is reused — keeps settle-loop tests from blowing up
 * if they happen to poll more times than the explicit fixture sequence.
 */
function fakeConnected(opts: {
  liveChainIds: number[]
  requestMock: ReturnType<typeof vi.fn>
}): { isConnected: boolean; connector: { getChainId: () => Promise<number>; getProvider: () => Promise<unknown> } } {
  const queue = [...opts.liveChainIds]
  let last = queue[0] ?? 0
  return {
    isConnected: true,
    connector: {
      getChainId: async () => {
        const next = queue.shift()
        if (next !== undefined) {
          last = next
          return next
        }
        return last
      },
      getProvider: async () => ({ request: opts.requestMock }),
    },
  }
}

describe('ensureChain', () => {
  it('no-ops when the connector already reports the target chain', async () => {
    const requestMock = vi.fn()
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [11155111], requestMock }))
    await ensureChain(11155111)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('sends wallet_switchEthereumChain with the hex-encoded target when chains differ', async () => {
    const requestMock = vi.fn().mockResolvedValueOnce(null)
    // Pre-switch read returns 84532; post-switch settle loop returns target on the first poll.
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [84532, 11155111], requestMock }))
    await ensureChain(11155111)
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      // 11155111 → 0xaa36a7
      params: [{ chainId: '0xaa36a7' }],
    })
  })

  it('settles after polling once the connector acknowledges the new chain', async () => {
    const requestMock = vi.fn().mockResolvedValueOnce(null)
    // Sequence: pre-switch=84532, poll1=84532 (not yet), poll2=11155111 (matched, exit).
    getAccountMock.mockReturnValue(fakeConnected({
      liveChainIds: [84532, 84532, 11155111],
      requestMock,
    }))
    await ensureChain(11155111)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('throws a friendly error when no wallet is connected', async () => {
    getAccountMock.mockReturnValue({ isConnected: false, connector: undefined })
    await expect(ensureChain(11155111)).rejects.toThrow(/no wallet connected/i)
  })

  it('throws an actionable error when the user rejects the switch', async () => {
    const rejection = Object.assign(new Error('User rejected the request.'), { code: 4001 })
    const requestMock = vi.fn().mockRejectedValue(rejection)
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [84532], requestMock }))
    await expect(ensureChain(11155111)).rejects.toThrow(/network switch declined/i)
    // Fresh account stub for the second invocation — the queue is consumed by the first call.
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [84532], requestMock }))
    await expect(ensureChain(11155111)).rejects.toThrow(/Ethereum Sepolia/)
  })

  it('throws an actionable error when the wallet does not have the chain configured (4902)', async () => {
    // EIP-3326: wallets return code 4902 when they don't know about the requested chain. The
    // user has to add it — we don't auto-add since the RPC URL we'd suggest may differ from the
    // user's preferred endpoint.
    const notAdded = Object.assign(new Error('Unrecognized chain ID "0xaa36a7"'), { code: 4902 })
    const requestMock = vi.fn().mockRejectedValueOnce(notAdded)
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [84532], requestMock }))
    await expect(ensureChain(11155111)).rejects.toThrow(/Ethereum Sepolia isn't configured in your wallet/i)
  })

  it('wraps unknown switch errors with chain context', async () => {
    const requestMock = vi.fn().mockRejectedValueOnce(new Error('internal RPC failure'))
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [84532], requestMock }))
    await expect(ensureChain(11155111)).rejects.toThrow(/Could not switch to Ethereum Sepolia/)
  })

  it('falls back to a chain-id label when the chain is unknown to our config', async () => {
    const requestMock = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('rejected'), { code: 4001 }),
    )
    getAccountMock.mockReturnValue(fakeConnected({ liveChainIds: [84532], requestMock }))
    await expect(ensureChain(9999)).rejects.toThrow(/chain 9999/)
  })

  it('throws when the connector does not expose an EIP-1193 provider', async () => {
    // Pathological case — we narrow at the boundary so this is the friendly path rather than a
    // raw "request is not a function" surfacing downstream.
    getAccountMock.mockReturnValue({
      isConnected: true,
      connector: {
        getChainId: async () => 84532,
        getProvider: async () => ({ /* no .request */ }),
      },
    })
    await expect(ensureChain(11155111)).rejects.toThrow(/did not expose an EIP-1193 provider/)
  })
})

describe('isUserRejection', () => {
  it('matches viem UserRejectedRequestError by name', () => {
    expect(_isUserRejection({ name: 'UserRejectedRequestError', message: '' })).toBe(true)
  })

  it('matches code 4001 (MetaMask user rejection)', () => {
    expect(_isUserRejection({ code: 4001, message: 'rejected' })).toBe(true)
  })

  it('matches ethers ACTION_REJECTED code', () => {
    expect(_isUserRejection({ code: 'ACTION_REJECTED' })).toBe(true)
  })

  it('matches "User rejected/denied/cancelled" message patterns', () => {
    expect(_isUserRejection(new Error('User rejected the request'))).toBe(true)
    expect(_isUserRejection(new Error('User denied transaction'))).toBe(true)
    expect(_isUserRejection(new Error('User cancelled'))).toBe(true)
  })

  it('recurses into the .cause chain (viem wraps provider errors)', () => {
    const inner = Object.assign(new Error('rejected'), { code: 4001 })
    const outer = new Error('Switch failed')
    ;(outer as Error & { cause: unknown }).cause = inner
    expect(_isUserRejection(outer)).toBe(true)
  })

  it('does NOT match unrelated errors', () => {
    expect(_isUserRejection(new Error('network unreachable'))).toBe(false)
    expect(_isUserRejection(new Error('insufficient funds'))).toBe(false)
    expect(_isUserRejection(null)).toBe(false)
    expect(_isUserRejection(undefined)).toBe(false)
  })
})

describe('isChainNotAdded', () => {
  it('matches EIP-3326 code 4902', () => {
    expect(_isChainNotAdded({ code: 4902 })).toBe(true)
  })

  it('matches the "Unrecognized chain" message pattern', () => {
    expect(_isChainNotAdded(new Error('Unrecognized chain ID "0xaa36a7"'))).toBe(true)
  })

  it('matches assorted "chain not added/configured/recognized" phrasings', () => {
    expect(_isChainNotAdded(new Error('chain is not added to wallet'))).toBe(true)
    expect(_isChainNotAdded(new Error('Chain not recognized'))).toBe(true)
    expect(_isChainNotAdded(new Error('chain is not configured here'))).toBe(true)
  })

  it('recurses into .cause', () => {
    const inner = Object.assign(new Error('Unrecognized chain'), { code: 4902 })
    const outer = new Error('Switch failed')
    ;(outer as Error & { cause: unknown }).cause = inner
    expect(_isChainNotAdded(outer)).toBe(true)
  })

  it('does NOT match unrelated errors or user rejections', () => {
    expect(_isChainNotAdded(new Error('User rejected'))).toBe(false)
    expect(_isChainNotAdded({ code: 4001 })).toBe(false)
    expect(_isChainNotAdded(null)).toBe(false)
  })
})
