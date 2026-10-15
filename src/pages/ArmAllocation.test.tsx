// ABOUTME: Tests for the public ARM allocation page — lookup validation and on-chain results.
// ABOUTME: RainbowKit and Ethereum reads are stubbed so the page can render without a wallet or mainnet.

import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ArmAllocation } from './ArmAllocation'

const { readAllocation, readUnlockSnapshot } = vi.hoisted(() => ({
  readAllocation: vi.fn(),
  readUnlockSnapshot: vi.fn(),
}))

vi.mock('@/lib/armAllocation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/armAllocation')>()
  return {
    ...actual,
    readAllocation,
    readUnlockSnapshot,
  }
})

vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: {
    Custom: ({
      children,
    }: {
      children: (args: {
        account: undefined
        mounted: boolean
        openConnectModal: () => void
        openAccountModal: () => void
      }) => ReactNode
    }) =>
      children({
        account: undefined,
        mounted: true,
        openConnectModal: () => undefined,
        openAccountModal: () => undefined,
      }),
  },
}))

const VALID = '0x1111111111111111111111111111111111111111'

describe('ArmAllocation', () => {
  beforeEach(() => {
    readUnlockSnapshot.mockResolvedValue({
      revenueUsd: 0,
      effectiveRevenueUsd: 0,
      unlockBps: 0,
      next: { usd: 10_000, bps: 1_000, remainingUsd: 10_000 },
    })
    readAllocation.mockResolvedValue({ status: 'empty', address: VALID })
  })

  it('renders the lookup and the supply split', () => {
    render(<ArmAllocation />)
    expect(screen.getByRole('heading', { name: 'Check your ARM allocation, sailor.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How ARM is split' })).toBeInTheDocument()
    expect(screen.getByLabelText('Wallet or Safe address')).toBeInTheDocument()
  })

  it('rejects an address that is not an Ethereum address', () => {
    render(<ArmAllocation />)
    fireEvent.change(screen.getByLabelText('Wallet or Safe address'), { target: { value: 'not-an-address' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check allocation' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid Ethereum address.')
    expect(readAllocation).not.toHaveBeenCalled()
  })

  it('shows no allocation when Ethereum has none for the address', async () => {
    render(<ArmAllocation />)
    fireEvent.change(screen.getByLabelText('Wallet or Safe address'), { target: { value: VALID } })
    fireEvent.click(screen.getByRole('button', { name: 'Check allocation' }))
    expect(await screen.findByRole('heading', { name: 'No allocation found' })).toBeInTheDocument()
  })

  it('shows the allocation Ethereum returns', async () => {
    readAllocation.mockResolvedValue({
      status: 'found',
      address: VALID,
      total: 60_000,
      unlocked: 0,
      available: 0,
      claimed: 0,
      locked: 60_000,
    })
    render(<ArmAllocation />)
    fireEvent.change(screen.getByLabelText('Wallet or Safe address'), { target: { value: VALID } })
    fireEvent.click(screen.getByRole('button', { name: 'Check allocation' }))
    expect(await screen.findByRole('heading', { name: 'Allocation found' })).toBeInTheDocument()
    expect(screen.getAllByText('60,000').length).toBeGreaterThan(0)
    expect(screen.getByText('Your unlock schedule based on project revenue')).toBeInTheDocument()
    expect(screen.getAllByText('Revenue-locked').length).toBeGreaterThan(3)
    expect(screen.getAllByText('Launch team').length).toBeGreaterThan(1)
    expect(screen.getByText('Your allocation')).toBeInTheDocument()
    expect(screen.queryByText('Next unlock: 6,000 ARM at $10k revenue')).not.toBeInTheDocument()
    expect(screen.queryByText('Verified on-chain')).not.toBeInTheDocument()
  })

  it('reports a read failure', async () => {
    readAllocation.mockRejectedValue(new Error('rpc down'))
    render(<ArmAllocation />)
    fireEvent.change(screen.getByLabelText('Wallet or Safe address'), { target: { value: VALID } })
    fireEvent.click(screen.getByRole('button', { name: 'Check allocation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read this address from Ethereum.')
  })
})
