// ABOUTME: Tests for ProgressStep stub — renders pre-record placeholder and post-record facts.
// ABOUTME: Replace these tests when TxLifecycleStepper ships and ProgressStep wraps it.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressStep } from './ProgressStep'
import type { TxRecord } from '@/lib/tx/types'

const sampleRecord: TxRecord<'shield'> = {
  id: '01JX',
  kind: 'shield',
  executionState: 'active',
  stage: 'submit-relayer',
  stagesCompleted: ['build-proof'],
  updatedSeq: 1,
  createdAt: 0,
  updatedAt: 0,
  meta: { amount: 1000000n, feeCacheId: 'fc-1', fromChainId: 1 },
  artifacts: {},
  walletContext: {
    evmAddress: '0xabc',
    railgunWalletId: 'rg-1',
    sourceChainId: 1,
  },
}

describe('<ProgressStep>', () => {
  it('renders preparing placeholder when no record exists', () => {
    render(<ProgressStep record={null} />)
    expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
  })

  it('renders kind, stage, and executionState from the record', () => {
    render(<ProgressStep record={sampleRecord} />)
    expect(screen.getByText('Transaction in progress')).toBeInTheDocument()
    expect(screen.getByText('shield')).toBeInTheDocument()
    expect(screen.getByText('submit-relayer')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })
})
