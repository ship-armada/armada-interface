// ABOUTME: Tests for TxCancelButton — "Cancel" under the live progress view while a spend can still be cancelled safely:
// ABOUTME: calls the executor's cancelTx; hidden once it can't, and on a follower tab (which doesn't run txs).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TxRecord } from '@/lib/tx/types'
import { txRecord } from '@/test/fixtures/txValues'

const executor = vi.hoisted(() => ({ cancelTx: vi.fn(), getIsLeader: vi.fn(() => true) }))
vi.mock('@/lib/tx/executor', () => executor)

import { TxCancelButton } from './TxCancelButton'

const proving = txRecord('transfer-shielded', { amount: 1n }, { id: 'tx-1', stage: 'build-proof', executionState: 'active' } as Partial<TxRecord>)

beforeEach(() => {
  executor.cancelTx.mockReset()
  executor.getIsLeader.mockReturnValue(true)
})

describe('<TxCancelButton>', () => {
  it('cancels the tx', () => {
    render(<TxCancelButton record={proving} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(executor.cancelTx).toHaveBeenCalledWith('tx-1')
  })

  it('is hidden once the tx can no longer be cancelled safely', () => {
    const submitting = { ...proving, stage: 'submit-relayer' } as TxRecord
    const { container } = render(<TxCancelButton record={submitting} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is hidden on a follower tab', () => {
    executor.getIsLeader.mockReturnValue(false)
    const { container } = render(<TxCancelButton record={proving} />)
    expect(container).toBeEmptyDOMElement()
  })
})
