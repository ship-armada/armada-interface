// ABOUTME: Tests for MergeNotesNotice — the callout that tells the user their notes are too fragmented for the
// ABOUTME: action and offers the merge as a button on its own row (default copy, custom copy, action wiring).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MergeNotesNotice } from './MergeNotesNotice'

describe('<MergeNotesNotice>', () => {
  it('explains the problem and offers "Merge notes"', () => {
    const onAction = vi.fn()
    render(<MergeNotesNotice onAction={onAction} />)
    expect(screen.getByText('Too many small notes')).toBeInTheDocument()
    expect(screen.getByText(/more small notes than this transaction can use/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Merge notes' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('takes custom copy and action label (e.g. another round after a merge)', () => {
    render(<MergeNotesNotice title="One more merge needed" body="Merge again to finish." actionLabel="Merge again" onAction={vi.fn()} />)
    expect(screen.getByText('One more merge needed')).toBeInTheDocument()
    expect(screen.getByText('Merge again to finish.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Merge again' })).toBeInTheDocument()
  })

  it('announces itself as a status region', () => {
    render(<MergeNotesNotice onAction={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Too many small notes')
  })
})
