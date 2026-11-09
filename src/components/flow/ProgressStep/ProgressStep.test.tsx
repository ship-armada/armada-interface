// ABOUTME: Tests for ProgressStep — pre-record placeholder vs. the processing layout once a record exists.
// ABOUTME: We assert via well-known stage copy ("Preparing transaction") that it rendered, and its live timing note.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ProgressStep } from './ProgressStep'
import type { TxRecord } from '@/lib/tx/types'

const sampleRecord: TxRecord<'shield'> = {
  id: '01JX',
  kind: 'shield',
  executionState: 'active',
  stage: 'build-proof',
  stagesCompleted: [],
  updatedSeq: 1,
  createdAt: 0,
  updatedAt: 0,
  meta: { amount: 1_000_000n, feeCacheId: 'fc-1', fromChainId: 31337 },
  artifacts: {},
  walletContext: {
    evmAddress: '0xabc',
    shieldedWalletId: 'rg-1',
    sourceChainId: 31337,
  },
}

describe('<ProgressStep>', () => {
  it('renders preparing placeholder when no record exists', () => {
    render(<ProgressStep record={null} />)
    expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
    expect(screen.getByText('Hang on a moment…')).toBeInTheDocument()
  })

  it('renders the processing layout (hero card + timeline) when a record is present', () => {
    render(<ProgressStep record={sampleRecord} />)
    // The hero card shows the per-kind title (rendered as two lines for shield); the timeline's
    // active row shows the entry-stage label "Preparing transaction" (shield's build-proof copy).
    expect(screen.getByText('being shielded')).toBeInTheDocument()
    expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
  })

  it('fills the ring from the real proof progress while a spend builds its proof', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const proving = {
      ...sampleRecord,
      kind: 'transfer-shielded',
      stage: 'build-proof',
      updatedAt: 10_000,
      artifacts: { proofProgress: 0.5 },
      meta: { amount: 1n },
    } as unknown as TxRecord
    render(<ProgressStep record={proving} />)
    expect(screen.getByRole('progressbar', { name: 'Building proof' })).toHaveAttribute('aria-valuenow', '50')
    act(() => vi.advanceTimersByTime(500))
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(50)
  })

  it('shows the active stage\'s usual time, turning to "taking longer than usual" once slow', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const confirming = {
      ...sampleRecord,
      stage: 'hub-pending',
      executionState: 'waiting',
      artifacts: { sourceTxHash: '0xabc' },
      stageEnteredAt: { 'build-proof': 90_000, 'hub-pending': 100_000 },
    } as unknown as TxRecord
    render(<ProgressStep record={confirming} />)
    // Normally: a quiet chip on the stepper's current row.
    expect(screen.getByText('Usually takes ~15 sec')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    // Slow: the chip gives way to the warning callout.
    act(() => vi.advanceTimersByTime(46_000))
    expect(screen.queryByText('Usually takes ~15 sec')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Taking longer than usual')
  })
})

afterEach(() => {
  vi.useRealTimers()
})

