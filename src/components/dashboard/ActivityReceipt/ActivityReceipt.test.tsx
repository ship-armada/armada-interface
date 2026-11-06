// ABOUTME: Tests for ActivityReceipt — a past tx's confirm-step summary from its record: title/amount + rows, a pending record's
// ABOUTME: live stepper, a failed record's banner (where the USDC is, "Get help"), the tx hash + copy, and "do it again".

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ActivityReceipt } from './ActivityReceipt'
import type { TxError, TxRecord } from '@/lib/tx/types'
import { SUPPORT_URL } from '@/config/support'

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

/** The shield record ended with `error` in `executionState`, optionally after broadcasting. */
function endedShield(error: TxError, executionState: TxRecord['executionState'], sourceTxHash?: `0x${string}`): TxRecord {
  return {
    ...shieldRecord(),
    stage: 'submit-relayer',
    stagesCompleted: ['build-proof'],
    executionState,
    artifacts: { error, ...(sourceTxHash ? { sourceTxHash } : {}) },
  } as unknown as TxRecord
}

describe('<ActivityReceipt> failure banner (package 11)', () => {
  it('a failed tx that moved nothing says where the USDC is, and links to Discord for help', () => {
    render(<ActivityReceipt record={endedShield({ code: 'PRE_FLIGHT_REVERT', message: 'Insufficient allowance' }, 'failed')} open onClose={vi.fn()} />)
    expect(screen.getByText('Insufficient allowance Your USDC is still in your wallet on Anvil Hub (local).')).toBeInTheDocument()
    const help = screen.getByRole('link', { name: /Get help on Discord/ })
    expect(help).toHaveAttribute('href', SUPPORT_URL)
    expect(help).toHaveAttribute('target', '_blank')
  })

  it('a network error while sending says it may have gone through, and nothing about where the USDC is', () => {
    render(<ActivityReceipt record={endedShield({ code: 'RPC_ERROR', message: 'x' }, 'failed')} open onClose={vi.fn()} />)
    expect(screen.getByText(/may or may not have gone through\. Check your balance before trying again\.$/)).toBeInTheDocument()
    expect(screen.queryByText(/still in your wallet/)).toBeNull()
  })

  it('a network error while building says nothing was sent, and where the USDC is', () => {
    const building = { ...endedShield({ code: 'RPC_ERROR', message: 'x' }, 'failed'), stage: 'build-proof', stagesCompleted: [] } as unknown as TxRecord
    render(<ActivityReceipt record={building} open onClose={vi.fn()} />)
    expect(
      screen.getByText('We hit an error talking to the chain before anything was sent. Try again. Your USDC is still in your wallet on Anvil Hub (local).'),
    ).toBeInTheDocument()
  })

  it('an unknown outcome says nothing about where the USDC is, but still offers help', () => {
    render(<ActivityReceipt record={endedShield({ code: 'POLL_TIMEOUT', message: 't' }, 'failed', '0xfeed')} open onClose={vi.fn()} />)
    expect(screen.getByText('Lost track of your transaction')).toBeInTheDocument()
    expect(screen.queryByText(/still in your wallet/)).toBeNull()
    expect(screen.getByRole('link', { name: /Get help on Discord/ })).toBeInTheDocument()
  })

  it('a cancelled tx says where the USDC is, with no help link — nothing went wrong', () => {
    render(<ActivityReceipt record={endedShield({ code: 'CANCELLED', message: '' }, 'cancelled')} open onClose={vi.fn()} />)
    expect(screen.getByText('No transaction was sent. Your USDC is still in your wallet on Anvil Hub (local).')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Get help on Discord/ })).toBeNull()
  })
})

describe('<ActivityReceipt>', () => {
  it('shows a pending tx\'s live stepper inside the usual receipt (no progress card), until it settles', () => {
    const pending = {
      ...shieldRecord(),
      stage: 'submit-relayer',
      stagesCompleted: ['build-proof'],
      executionState: 'active',
    } as unknown as TxRecord
    const { rerender } = render(<ActivityReceipt record={pending} open onClose={vi.fn()} />)
    // The receipt's own title + amount, with the stepper (collapsed to the current step) — not the modal's card.
    expect(screen.getByText('USDC shield')).toBeInTheDocument()
    expect(screen.getByLabelText('Transaction progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
    expect(screen.queryByText(/being shielded/)).toBeNull()

    // It updates in place: once the record settles, the stepper goes and the usual receipt remains.
    rerender(<ActivityReceipt record={shieldRecord()} open onClose={vi.fn()} />)
    expect(screen.getByText('USDC shield')).toBeInTheDocument()
    expect(screen.queryByLabelText('Transaction progress')).toBeNull()
  })

  it('a cross-chain unshield receipt includes the CCTP fee it recorded, as the confirmation screen does', () => {
    const xchain = {
      ...shieldRecord(),
      kind: 'unshield-xchain',
      stage: 'client-mint-confirmed',
      meta: {
        amount: 100_000_000n, feeCacheId: 'x', toChainId: 84532, recipient: '0x1234567890abcdef1234567890abcdef12345678',
        broadcasterFeeAmount: 1_500_000n, broadcasterShieldedAddress: '0zk_r', cctpFee: 20_000n,
      },
    } as unknown as TxRecord
    render(<ActivityReceipt record={xchain} open onClose={vi.fn()} />)
    // Itemised: the relayer fee charged on top, and the CCTP fee (an estimate) taken from the amount.
    expect(screen.getByText('1.50 USDC')).toBeInTheDocument()
    expect(screen.getByText('≈ 0.02 USDC')).toBeInTheDocument()
  })

  it('a received payment shows no Fees row (the recipient pays none, and can\'t see the sender\'s)', () => {
    const received = {
      ...shieldRecord(),
      kind: 'transfer-shielded-received',
      stage: 'observed',
      meta: { amount: 10_000_000n },
    } as unknown as TxRecord
    render(<ActivityReceipt record={received} open onClose={vi.fn()} />)
    expect(screen.getByText('USDC received')).toBeInTheDocument()
    expect(screen.queryByText('Fees')).toBeNull()
  })

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

  it('shows the tx hash, shortened, with a button that copies it in full (8C)', () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const withHash = { ...shieldRecord(), artifacts: { sourceTxHash: hash } } as unknown as TxRecord
    render(<ActivityReceipt record={withHash} open onClose={vi.fn()} />)
    expect(screen.getByText('0x1234...abcdef')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy transaction hash' })).toBeInTheDocument()
  })

  it('has no tx hash line before there is a hash', () => {
    render(<ActivityReceipt record={shieldRecord()} open onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Copy transaction hash' })).toBeNull()
  })

  it('"Shield again" closes the receipt, then hands its prefill on (8C)', async () => {
    const onClose = vi.fn()
    const onRepeat = vi.fn()
    render(<ActivityReceipt record={shieldRecord()} open onClose={onClose} onRepeat={onRepeat} />)
    fireEvent.click(screen.getByRole('button', { name: 'Shield again' }))
    await waitFor(() => expect(onRepeat).toHaveBeenCalledWith({ flow: 'shield', amount: '100.5', fromChainId: 31337 }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('offers no "do it again" for a tx still in flight, or without a handler', () => {
    const pending = { ...shieldRecord(), stage: 'submit-relayer', executionState: 'active' } as unknown as TxRecord
    const { rerender } = render(<ActivityReceipt record={pending} open onClose={vi.fn()} onRepeat={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Shield again' })).toBeNull()
    rerender(<ActivityReceipt record={shieldRecord()} open onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Shield again' })).toBeNull()
  })

  it('fires onClose from the Done CTA after the exit animation', async () => {
    const onClose = vi.fn()
    render(<ActivityReceipt record={shieldRecord()} open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    // Close is deferred until the slide-down exit finishes.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
