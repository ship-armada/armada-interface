// ABOUTME: Tests for ConsolidationSummary — the merge summary table: token, notes merged (N → M), fee, and a
// ABOUTME: Total that is just the fee (a merge moves no value out); optional rows hide when their data is absent.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConsolidationSummary } from './ConsolidationSummary'

describe('<ConsolidationSummary>', () => {
  it('shows the token, the notes merged into fewer notes, and the fee as the total', () => {
    render(<ConsolidationSummary tokenLabel="USDC" notesMerged={11} notesCreated={2} fee={40_000n} />)
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('11 → 2')).toBeInTheDocument()
    // Fee and Total are both the fee — nothing else leaves the wallet.
    expect(screen.getAllByText('0.04 USDC')).toHaveLength(2)
  })

  it('hides the token and notes rows when unknown (a merge recovered from chain)', () => {
    render(<ConsolidationSummary fee={20_000n} />)
    expect(screen.queryByText('Token')).toBeNull()
    expect(screen.queryByText('Notes')).toBeNull()
    expect(screen.getAllByText('0.02 USDC')).toHaveLength(2)
  })

  it('shows a dash while the fee is still being worked out', () => {
    render(<ConsolidationSummary tokenLabel="USDC" notesMerged={6} notesCreated={1} fee={null} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('adds the date row on a confirmed merge', () => {
    render(<ConsolidationSummary fee={20_000n} confirmedAt={Date.UTC(2026, 8, 24, 12, 0)} />)
    expect(screen.getByText('Date and time')).toBeInTheDocument()
  })
})
