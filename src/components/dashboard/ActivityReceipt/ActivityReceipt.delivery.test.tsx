// ABOUTME: Tests a cross-chain unshield's receipt: its destination (CCTP mint) link from lib/explorer::deliveryExplorerLink (mocked:
// ABOUTME: the local test network has no explorer URLs), and "Recipient received" once Circle's actual fee is known (UN-4).

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TxRecord } from '@/lib/tx/types'

vi.mock('@/lib/explorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/explorer')>()
  return {
    ...actual,
    deliveryExplorerLink: (record: TxRecord) =>
      record.kind === 'unshield-xchain' ? { url: 'https://sepolia.basescan.org/tx/0xab', chainName: 'Base Sepolia' } : null,
  }
})

import { ActivityReceipt } from './ActivityReceipt'
import { A, C, C_ACTUAL, F, txRecord } from '@/test/fixtures/txValues'
import { summaryRow } from '@/test/summaryRows'

const RECIPIENT_EVM = '0x1234567890abcdef1234567890abcdef12345678'

describe('<ActivityReceipt> — cross-chain delivery link (14A)', () => {
  it('links to the mint on the destination chain under the summary', () => {
    const record = txRecord(
      'unshield-xchain',
      { amount: A, broadcasterFeeAmount: F, broadcasterFeePerProof: F, recipient: RECIPIENT_EVM, toChainId: 31338, cctpFee: C },
      { artifacts: { sourceTxHash: '0x01', destTxHash: '0xab' } } as Partial<TxRecord>,
    )
    render(<ActivityReceipt record={record} open onClose={vi.fn()} />)
    expect(screen.getByRole('link', { name: /View delivery on Base Sepolia/ })).toHaveAttribute(
      'href',
      'https://sepolia.basescan.org/tx/0xab',
    )
  })
})

describe('<ActivityReceipt> — what a cross-chain unshield delivered (UN-4)', () => {
  const meta = { amount: A, broadcasterFeeAmount: F, broadcasterFeePerProof: F, recipient: RECIPIENT_EVM, toChainId: 31338 }

  it('shows "Recipient received" — the amount less Circle\'s actual fee — once it is known', () => {
    render(<ActivityReceipt record={txRecord('unshield-xchain', { ...meta, cctpFee: C_ACTUAL, cctpFeeIsEstimate: false })} open onClose={vi.fn()} />)
    expect(summaryRow('Recipient received')).toBe('9.849999 USDC')
  })

  it('has no such row while the fee is still the estimate', () => {
    render(<ActivityReceipt record={txRecord('unshield-xchain', { ...meta, cctpFee: C, cctpFeeIsEstimate: true })} open onClose={vi.fn()} />)
    expect(() => summaryRow('Recipient received')).toThrow()
  })
})
