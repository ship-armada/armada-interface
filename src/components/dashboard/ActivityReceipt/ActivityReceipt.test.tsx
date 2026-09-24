// ABOUTME: Tests for ActivityReceipt — reconstructs a past tx's confirm-step summary from its record.
// ABOUTME: Covers the title/amount + a summary row for a deposit, and that null record renders nothing.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ActivityReceipt } from './ActivityReceipt'
import type { TxRecord } from '@/lib/tx/types'

function shieldRecord(): TxRecord {
  return {
    id: 'rec-1',
    kind: 'shield',
    stage: 'hub-confirmed',
    stagesCompleted: ['build-proof', 'submit-relayer', 'hub-confirmed'],
    executionState: 'completed',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_050_000,
    walletContext: { sourceChainId: 31337 },
    meta: { amount: 100_500_000n, fromChainId: 31337, feeCacheId: 'x' },
    artifacts: {},
  } as unknown as TxRecord
}

function mergeRecord(): TxRecord {
  return {
    ...shieldRecord(),
    kind: 'consolidate',
    meta: {
      amount: 0n, feeCacheId: 'x', tokenAddress: '0xusdc', tokenSymbol: 'USDC',
      broadcasterFeeAmount: 40_000n, broadcasterShieldedAddress: '0zk_r', notesMerged: 11, notesCreated: 2,
    },
  } as unknown as TxRecord
}

describe('<ActivityReceipt>', () => {
  it('shows a note merge by its fee, with the notes merged', () => {
    render(<ActivityReceipt record={mergeRecord()} open onClose={vi.fn()} />)
    expect(screen.getByText('Notes merged')).toBeInTheDocument()
    expect(screen.getByText('0.04')).toBeInTheDocument()
    expect(screen.getByText('11 → 2')).toBeInTheDocument()
  })

  it('renders nothing when record is null', () => {
    render(<ActivityReceipt record={null} open onClose={vi.fn()} />)
    expect(screen.queryByText('USDC shield')).toBeNull()
  })

  it('shows the deposit title + amount + a summary row', () => {
    render(<ActivityReceipt record={shieldRecord()} open onClose={vi.fn()} />)
    expect(screen.getByText('USDC shield')).toBeInTheDocument()
    expect(screen.getByText('100.5')).toBeInTheDocument()
    // The reused DepositReviewSummary surfaces the confirmed "Date and time" row.
    expect(screen.getByText('Date and time')).toBeInTheDocument()
  })

  it('nets a gasless shield by BOTH the relayer fee and the protocol shield fee', () => {
    // The real 4-USDC gasless shield: relayer fee 0.742317, protocol shield fee 0.016288. The receipt
    // must show received = 4 - 0.742317 - 0.016288 = 3.241395 (→ "3.24"), NOT 4 - relayerFee = 3.257683
    // ("3.26", the bug where the protocol fee was omitted).
    const record = {
      ...shieldRecord(),
      meta: {
        amount: 4_000_000n, feeAmount: 742_317n, protocolFee: 16_288n, useGasless: true,
        fromChainId: 31337, feeCacheId: 'x',
      },
    } as unknown as TxRecord
    render(<ActivityReceipt record={record} open onClose={vi.fn()} />)
    expect(screen.getByText('3.241395 USDC')).toBeInTheDocument()
    expect(screen.queryByText('3.257683 USDC')).toBeNull()
    // Fees row shows the combined 0.758605, not the relayer-only 0.742317.
    expect(screen.getByText('0.758605 USDC')).toBeInTheDocument()
  })

  it('nets a recovered shield-xchain by the relayer, protocol AND CCTP fees (Fix A)', () => {
    // A recovered cross-chain shield: amount is the TRUE deposit (CCTP burn amount), and the note that
    // landed = burn − cctp − protocol (relayer 0 here). received = 3 − 0.025388 − 0.014873 = 2.959739;
    // the fees row shows the combined 0.040261, not just one leg.
    const record = {
      ...shieldRecord(),
      kind: 'shield-xchain',
      meta: {
        amount: 3_000_000n, cctpFee: 25_388n, protocolFee: 14_873n,
        fromChainId: 84532, feeCacheId: 'x',
      },
    } as unknown as TxRecord
    render(<ActivityReceipt record={record} open onClose={vi.fn()} />)
    expect(screen.getByText('2.959739 USDC')).toBeInTheDocument()
    expect(screen.getByText('0.040261 USDC')).toBeInTheDocument()
  })

  it('disables View on explorer without a source tx hash', () => {
    render(<ActivityReceipt record={shieldRecord()} open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'View on explorer' })).toBeDisabled()
  })

  it('fires onClose from the Done CTA after the exit animation', async () => {
    const onClose = vi.fn()
    render(<ActivityReceipt record={shieldRecord()} open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    // Close is deferred until the slide-down exit finishes.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
