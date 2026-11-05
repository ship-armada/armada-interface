// ABOUTME: Tests for ProgressStep — pre-record placeholder vs. delegating to TxLifecycleStepper once a record exists.
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
    expect(screen.getByText('Usually takes ~15 sec')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(46_000))
    expect(screen.getByText('Taking longer than usual')).toBeInTheDocument()
  })
})

afterEach(() => {
  vi.useRealTimers()
})

