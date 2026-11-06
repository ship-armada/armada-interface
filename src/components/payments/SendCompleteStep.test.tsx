// ABOUTME: Tests for SendCompleteStep — confirmed title by variant, date/network summary rows (privacy notice hidden once confirmed), CTA wiring,
// ABOUTME: and a cross-chain exit's "Recipient received" / "You received" row once Circle's actual fee is known.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SendCompleteStep, type SendCompleteStepProps } from './SendCompleteStep'

const VALID_EVM = '0xabcdef1234567890abcdef1234567890abcdef12'
const VALID_0ZK = '0zkabcdefghijklmnopqrstuvwxyz0123456789aaaa'

function renderComplete(extras?: Partial<SendCompleteStepProps>) {
  const props: SendCompleteStepProps = {
    variant: extras?.variant ?? 'send',
    recipient: extras?.recipient ?? VALID_0ZK,
    armadaAddress: extras?.armadaAddress,
    amount: extras?.amount ?? 100_000_000n,
    fee: extras?.fee ?? null,
    totalDeducted: extras?.totalDeducted ?? 100_000_000n,
    networkName: extras?.networkName,
    cctpFee: extras?.cctpFee,
    received: extras?.received,
    confirmedAt: extras?.confirmedAt ?? Date.now(),
    explorerUrl: extras?.explorerUrl,
    deliveryLink: extras?.deliveryLink,
    onViewExplorer: extras?.onViewExplorer ?? vi.fn(),
    onGoToDashboard: extras?.onGoToDashboard ?? vi.fn(),
  }
  render(<SendCompleteStep {...props} />)
  return props
}

describe('<SendCompleteStep>', () => {
  it('a cross-chain send shows what the recipient received once the actual CCTP fee is known (UN-4)', () => {
    renderComplete({ recipient: VALID_EVM, networkName: 'Base Sepolia', cctpFee: { amount: 150_000n, estimated: false }, received: 99_850_000n })
    const row = screen.getByText('Recipient received').closest('div')
    expect(row).toHaveTextContent('99.85 USDC')
  })

  it('an unshield to your own wallet says "You received"; no row without the figure', () => {
    renderComplete({ variant: 'withdraw', recipient: VALID_EVM, cctpFee: { amount: 150_000n, estimated: false }, received: 99_850_000n })
    expect(screen.getByText('You received')).toBeInTheDocument()
    cleanup()
    renderComplete({ recipient: VALID_EVM, cctpFee: { amount: 300_000n, estimated: true } })
    expect(screen.queryByText('Recipient received')).toBeNull()
  })

  it('send: renders the "USDC shielded transfer confirmed" title + date row + amount (privacy notice hidden)', () => {
    renderComplete({ recipient: VALID_0ZK })
    expect(screen.getByText('USDC shielded transfer confirmed')).toBeInTheDocument()
    expect(screen.getByText('Date and time')).toBeInTheDocument()
    // The privacy notice is only shown pre-confirmation; the confirmed view omits it.
    expect(screen.queryByText('Private transfer.')).toBeNull()
    expect(screen.getAllByText(/100\.00 USDC/).length).toBeGreaterThan(0)
  })

  it('public: renders the network row + amount (no privacy notice once confirmed)', () => {
    renderComplete({
      recipient: VALID_EVM,
      networkName: 'Anvil Hub (local)',
      amount: 50_000_000n,
      totalDeducted: 50_000_000n,
    })
    expect(screen.getByText('Anvil Hub (local)')).toBeInTheDocument()
    expect(screen.queryByText('Public transfer.')).toBeNull()
    expect(screen.getAllByText(/50\.00 USDC/).length).toBeGreaterThan(0)
  })

  it('withdraw variant: uses the "USDC unshield confirmed" title', () => {
    renderComplete({ variant: 'withdraw', recipient: VALID_EVM, networkName: 'Anvil Hub (local)' })
    expect(screen.getByText('USDC unshield confirmed')).toBeInTheDocument()
  })

  it('disables "View on explorer" when no explorer URL is provided', () => {
    renderComplete()
    expect(screen.getByRole('button', { name: /View on explorer/ })).toBeDisabled()
  })

  it('fires onGoToDashboard when the primary CTA is clicked', () => {
    const onGoToDashboard = vi.fn()
    renderComplete({ onGoToDashboard })
    fireEvent.click(screen.getByRole('button', { name: /Go to dashboard/ }))
    expect(onGoToDashboard).toHaveBeenCalledTimes(1)
  })

  it('fires onViewExplorer when a URL is present', () => {
    const onViewExplorer = vi.fn()
    renderComplete({ explorerUrl: 'https://example.test/tx/0xabc', onViewExplorer })
    fireEvent.click(screen.getByRole('button', { name: /View on explorer/ }))
    expect(onViewExplorer).toHaveBeenCalledTimes(1)
  })

  it('a cross-chain send links to its delivery (mint) on the destination chain (14A)', () => {
    renderComplete({ recipient: VALID_EVM, deliveryLink: { url: 'https://sepolia.basescan.org/tx/0xab', chainName: 'Base Sepolia' } })
    expect(screen.getByRole('link', { name: /View delivery on Base Sepolia/ })).toHaveAttribute(
      'href',
      'https://sepolia.basescan.org/tx/0xab',
    )
  })
})
