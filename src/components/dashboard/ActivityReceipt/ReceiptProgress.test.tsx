// ABOUTME: Tests for ReceiptProgress — the pending receipt's live stepper: shown while in flight; on settling it holds the
// ABOUTME: finished step, then collapses; a failure collapses at once; reduced motion removes it immediately.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { TxRecord } from '@/lib/tx/types'
import { txRecord } from '@/test/fixtures/txValues'
// The Cancel under the stepper shows only on the tab that runs txs.
vi.mock('@/lib/tx/executor', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tx/executor')>()),
  getIsLeader: () => true,
}))

import { ReceiptProgress, RECEIPT_PROGRESS_MS } from './ReceiptProgress'

function shield(overrides: Partial<TxRecord>): TxRecord {
  return txRecord('shield', { amount: 5_000_000n, fromChainId: 31337 }, overrides)
}

const PENDING = shield({ stage: 'submit-relayer', stagesCompleted: ['build-proof'], executionState: 'active' } as Partial<TxRecord>)
const SETTLED = shield({ stage: 'hub-confirmed', executionState: 'completed' } as Partial<TxRecord>)
const FAILED = shield({
  stage: 'submit-relayer',
  executionState: 'failed',
  artifacts: { error: { code: 'TX_REVERTED', message: 'x' } },
} as Partial<TxRecord>)

const stepper = () => screen.queryByLabelText('Transaction progress')
const wrapper = (container: HTMLElement) => container.firstElementChild as HTMLElement | null

describe('<ReceiptProgress>', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    vi.useFakeTimers()
    // The test setup reports reduced motion; these cases need the full motion.
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
    vi.useRealTimers()
  })

  it('shows the active stage\'s usual time as a chip on the stepper', () => {
    vi.setSystemTime(50_000)
    const confirming = shield({
      stage: 'hub-pending',
      executionState: 'waiting',
      artifacts: { sourceTxHash: '0xabc' },
      stageEnteredAt: { 'hub-pending': 50_000 },
    } as Partial<TxRecord>)
    render(<ReceiptProgress record={confirming} status="pending" />)
    expect(screen.getByText('~15 sec')).toBeInTheDocument()
  })

  it('offers Cancel while a spend is still building its proof', () => {
    const proving = txRecord('transfer-shielded', { amount: 1n }, { stage: 'build-proof', executionState: 'active' } as Partial<TxRecord>)
    render(<ReceiptProgress record={proving} status="pending" />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('renders nothing for a tx that was never pending here', () => {
    const { container } = render(<ReceiptProgress record={SETTLED} status="settled" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the stepper while the tx is in flight', () => {
    const { container } = render(<ReceiptProgress record={PENDING} status="pending" />)
    expect(stepper()).toBeInTheDocument()
    expect(wrapper(container)).toHaveAttribute('data-phase', 'shown')
  })

  it('on settling, holds the finished step, then collapses, then goes', () => {
    const { container, rerender } = render(<ReceiptProgress record={PENDING} status="pending" />)
    rerender(<ReceiptProgress record={SETTLED} status="settled" />)
    expect(wrapper(container)).toHaveAttribute('data-phase', 'holding')
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Shielded')
    act(() => vi.advanceTimersByTime(RECEIPT_PROGRESS_MS.hold))
    expect(wrapper(container)).toHaveAttribute('data-phase', 'leaving')
    act(() => vi.advanceTimersByTime(RECEIPT_PROGRESS_MS.collapse))
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the same element from in flight through the hold (no remount, so the entrance never replays)', () => {
    const { container, rerender } = render(<ReceiptProgress record={PENDING} status="pending" />)
    const before = wrapper(container)
    const observer = new MutationObserver(() => {})
    observer.observe(container, { childList: true })
    rerender(<ReceiptProgress record={SETTLED} status="settled" />)
    const childChanges = observer.takeRecords()
    observer.disconnect()
    expect(wrapper(container)).toBe(before)
    expect(childChanges).toEqual([])
  })

  it('collapses at once when the tx fails (no finished step to show)', () => {
    const { container, rerender } = render(<ReceiptProgress record={PENDING} status="pending" />)
    rerender(<ReceiptProgress record={FAILED} status="failed" />)
    expect(wrapper(container)).toHaveAttribute('data-phase', 'leaving')
    act(() => vi.advanceTimersByTime(RECEIPT_PROGRESS_MS.collapse))
    expect(container).toBeEmptyDOMElement()
  })

  it('comes back if the tx is pending again before it has gone (a retry)', () => {
    const { container, rerender } = render(<ReceiptProgress record={PENDING} status="pending" />)
    rerender(<ReceiptProgress record={FAILED} status="failed" />)
    rerender(<ReceiptProgress record={PENDING} status="pending" />)
    act(() => vi.advanceTimersByTime(RECEIPT_PROGRESS_MS.collapse))
    expect(wrapper(container)).toHaveAttribute('data-phase', 'shown')
  })
})

describe('<ReceiptProgress> under reduced motion', () => {
  it('goes as soon as the tx settles', () => {
    const { container, rerender } = render(<ReceiptProgress record={PENDING} status="pending" />)
    rerender(<ReceiptProgress record={SETTLED} status="settled" />)
    expect(container).toBeEmptyDOMElement()
  })
})
