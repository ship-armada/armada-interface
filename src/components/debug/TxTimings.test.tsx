// ABOUTME: Tests for TxTimings — the Debug page's p50 / p90 table per kind and stage (seconds), an empty state, and "Copy"
// ABOUTME: putting the table on the clipboard as plain text to share.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TxTimings } from './TxTimings'
import type { TimingRow } from '@/lib/tx/timings'

const ROWS: TimingRow[] = [
  { kind: 'shield', stage: 'build-proof', samples: 3, p50: 1_200, p90: 3_450 },
  { kind: 'shield', stage: 'total', samples: 3, p50: 9_000, p90: 14_000 },
]

describe('<TxTimings>', () => {
  it('lists each kind and stage with its sample count and p50 / p90 in seconds', () => {
    render(<TxTimings rows={ROWS} />)
    const row = screen.getByRole('row', { name: /build-proof/ })
    expect(row).toHaveTextContent('shield')
    expect(row).toHaveTextContent('3')
    expect(row).toHaveTextContent('1.2s')
    expect(row).toHaveTextContent('3.5s')
  })

  it('says how to get data when there is none yet', () => {
    render(<TxTimings rows={[]} />)
    expect(screen.getByText(/No completed transactions with timings yet/)).toBeInTheDocument()
  })

  it('copies the table as plain text', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<TxTimings rows={ROWS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    expect(writeText).toHaveBeenCalledWith(
      'kind\tstage\tn\tp50\tp90\nshield\tbuild-proof\t3\t1.2s\t3.5s\nshield\ttotal\t3\t9.0s\t14.0s',
    )
  })
})
