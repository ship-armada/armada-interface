// ABOUTME: Unit tests for ensureChain — wallet network auto-switching before user signatures.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted mocks so `vi.mock` factories below can reference them.
const { getAccountMock, switchChainMock } = vi.hoisted(() => ({
  getAccountMock: vi.fn(),
  switchChainMock: vi.fn(),
}))

vi.mock('wagmi/actions', () => ({
  getAccount: getAccountMock,
  switchChain: switchChainMock,
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

import { ensureChain, _isUserRejection } from './network-switch'

beforeEach(() => {
  getAccountMock.mockReset()
  switchChainMock.mockReset()
})

describe('ensureChain', () => {
  it('no-ops when already on the target chain', async () => {
    getAccountMock.mockReturnValue({ isConnected: true, chainId: 11155111 })
    await ensureChain(11155111)
    expect(switchChainMock).not.toHaveBeenCalled()
  })

  it('calls switchChain when on a different chain', async () => {
    getAccountMock.mockReturnValue({ isConnected: true, chainId: 84532 })
    switchChainMock.mockResolvedValueOnce(undefined)
    await ensureChain(11155111)
    expect(switchChainMock).toHaveBeenCalledWith({ _mock: true }, { chainId: 11155111 })
  })

  it('throws a friendly error when no wallet is connected', async () => {
    getAccountMock.mockReturnValue({ isConnected: false, chainId: undefined })
    await expect(ensureChain(11155111)).rejects.toThrow(/no wallet connected/i)
    expect(switchChainMock).not.toHaveBeenCalled()
  })

  it('throws an actionable error when the user rejects the switch', async () => {
    getAccountMock.mockReturnValue({ isConnected: true, chainId: 84532 })
    const rejection = Object.assign(new Error('User rejected the request.'), { code: 4001 })
    switchChainMock.mockRejectedValue(rejection)
    // Two assertions = two invocations of ensureChain; use sticky mockRejectedValue (not Once).
    await expect(ensureChain(11155111)).rejects.toThrow(/network switch declined/i)
    await expect(ensureChain(11155111)).rejects.toThrow(/Ethereum Sepolia/)
  })

  it('wraps unknown switch errors with chain context', async () => {
    getAccountMock.mockReturnValue({ isConnected: true, chainId: 84532 })
    switchChainMock.mockRejectedValue(new Error('chain not configured'))
    await expect(ensureChain(11155111)).rejects.toThrow(/Could not switch to Ethereum Sepolia/)
    await expect(ensureChain(11155111)).rejects.toThrow(/chain not configured/)
  })

  it('falls back to a chain-id label when the chain is unknown to our config', async () => {
    getAccountMock.mockReturnValue({ isConnected: true, chainId: 84532 })
    switchChainMock.mockRejectedValue(Object.assign(new Error('rejected'), { code: 4001 }))
    await expect(ensureChain(9999)).rejects.toThrow(/chain 9999/)
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
