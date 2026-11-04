// ABOUTME: Tests that the ActivityReceipt shows a cross-chain tx's destination (CCTP mint) link from
// ABOUTME: lib/explorer::deliveryExplorerLink (mocked here: the local test network has no explorer URLs).

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
import { A, C, F, txRecord } from '@/test/fixtures/txValues'

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
