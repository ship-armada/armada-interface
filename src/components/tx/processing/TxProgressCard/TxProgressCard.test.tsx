// ABOUTME: Tests for TxProgressCard's ring — a sweeping (indeterminate) ring by default; with `progress`, a determinate fill
// ABOUTME: that lights the matching share of its 60 ticks (the proof's real progress) and is announced as a progress bar.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TxProgressCard } from './TxProgressCard'

const COPY = { tag: 'Shield', title: 'Your USDC is being shielded', subtitle: 'You can close this.' }

describe('<TxProgressCard> ring', () => {
  it('sweeps (no fill, no progress bar) without a progress value', () => {
    const { container } = render(<TxProgressCard copy={COPY} />)
    expect(container.querySelectorAll('[data-filled]')).toHaveLength(0)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('fills the share of ticks matching the progress and reports it as a progress bar', () => {
    const { container } = render(<TxProgressCard copy={COPY} progress={0.5} />)
    expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(30)
    expect(screen.getByRole('progressbar', { name: 'Building proof' })).toHaveAttribute('aria-valuenow', '50')
  })
})
