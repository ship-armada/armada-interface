// ABOUTME: Tests for WalletMenu — the pill opens the side panel; copy / disconnect / deposit / hide-balance actions wire through; explorer disables without a URL.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WalletMenu, buildWalletChainBalances, type WalletMenuProps } from './WalletMenu'

const FULL = '0x1234567890abcdef1234567890abcdef12345678'
const DISPLAY = '0x1234…5678'

function setup(extra?: Partial<WalletMenuProps>) {
  const props: WalletMenuProps = {
    displayAddress: DISPLAY,
    fullAddress: FULL,
    walletProvider: 'MetaMask',
    balances: [{ chainId: 11155111, networkLabel: 'Ethereum Sepolia', usdcBalance: 1234.5 }],
    networkLabel: 'Ethereum Sepolia',
    explorerUrl: `https://sepolia.etherscan.io/address/${FULL}`,
    balanceHidden: false,
    onBalanceHiddenChange: vi.fn(),
    onDisconnect: vi.fn(),
    onDeposit: vi.fn(),
    ...extra,
  }
  render(<WalletMenu {...props} />)
  return props
}

// Opening fades the pill out, then reveals the panel on a short timer — await the dialog.
async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(DISPLAY) }))
  await screen.findByRole('dialog', { name: 'Wallet' })
}

describe('<WalletMenu>', () => {
  it('renders the pill with the truncated address', () => {
    setup()
    expect(screen.getByRole('button', { name: new RegExp(DISPLAY) })).toBeInTheDocument()
  })

  it('opens the side panel on pill click', async () => {
    setup()
    expect(screen.queryByRole('dialog', { name: 'Wallet' })).toBeNull()
    await openPanel()
    expect(screen.getByRole('dialog', { name: 'Wallet' })).toBeInTheDocument()
  })

  it('copies the full address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setup()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(FULL)
    // Await the post-copy state flip so the async setState settles inside act (pristine output).
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('fires onDisconnect', async () => {
    const props = setup()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(props.onDisconnect).toHaveBeenCalledTimes(1)
  })

  it('fires onDeposit', async () => {
    const props = setup()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Shield your USDC' }))
    expect(props.onDeposit).toHaveBeenCalledTimes(1)
  })

  it('requests a balance-visibility change (controlled, shared app-wide)', async () => {
    const props = setup()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(props.onBalanceHiddenChange).toHaveBeenCalledWith(true)
  })

  it('reflects the hidden state from props', async () => {
    setup({ balanceHidden: true })
    await openPanel()
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument()
  })

  it('disables the explorer action when no URL is available', async () => {
    setup({ explorerUrl: undefined })
    await openPanel()
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeDisabled()
  })

  it('defaults to a combined Total row and expands to the per-chain breakdown (#8)', async () => {
    setup({
      balances: [
        { chainId: 11155111, networkLabel: 'Ethereum Sepolia', usdcBalance: 5 },
        { chainId: 84532, networkLabel: 'Base Sepolia', usdcBalance: 3 },
      ],
    })
    await openPanel()
    // Collapsed by default: a combined Total (5 + 3 = 8) across "2 networks"; per-chain rows hidden.
    expect(screen.getByLabelText('8 USDC total')).toBeInTheDocument()
    expect(screen.getByText('2 networks')).toBeInTheDocument()
    expect(screen.queryByLabelText('5 USDC on Ethereum Sepolia')).toBeNull()
    // Expand → the per-chain breakdown appears.
    fireEvent.click(screen.getByRole('button', { name: /2 networks/ }))
    expect(screen.getByLabelText('5 USDC on Ethereum Sepolia')).toBeInTheDocument()
    expect(screen.getByLabelText('3 USDC on Base Sepolia')).toBeInTheDocument()
  })

  it('shows a single chain directly with no Total toggle', async () => {
    setup({ balances: [{ chainId: 84532, networkLabel: 'Base Sepolia', usdcBalance: 3 }] })
    await openPanel()
    expect(screen.getByLabelText('3 USDC on Base Sepolia')).toBeInTheDocument()
    // No combined "N networks" toggle when there's only one chain.
    expect(screen.queryByText(/networks/)).toBeNull()
  })
})

describe('buildWalletChainBalances', () => {
  const nameOf = (id: number) => (id === 11155111 ? 'Ethereum Sepolia' : id === 84532 ? 'Base Sepolia' : `Chain ${id}`)

  it('returns one row per chain with a positive balance, sorted by balance desc', () => {
    const rows = buildWalletChainBalances({ 11155111: 5_000_000n, 84532: 8_000_000n }, 11155111, nameOf)
    expect(rows).toEqual([
      { chainId: 84532, networkLabel: 'Base Sepolia', usdcBalance: 8 },
      { chainId: 11155111, networkLabel: 'Ethereum Sepolia', usdcBalance: 5 },
    ])
  })

  it('drops zero-balance chains', () => {
    const rows = buildWalletChainBalances({ 11155111: 5_000_000n, 84532: 0n }, 84532, nameOf)
    expect(rows.map((r) => r.chainId)).toEqual([11155111])
  })

  it('falls back to a single zero row for the connected chain when nothing is held', () => {
    const rows = buildWalletChainBalances({ 11155111: 0n }, 84532, nameOf)
    expect(rows).toEqual([{ chainId: 84532, networkLabel: 'Base Sepolia', usdcBalance: 0 }])
  })
})
