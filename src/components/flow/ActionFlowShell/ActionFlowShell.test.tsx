// ABOUTME: Tests for ActionFlowShell — open/close, step-driven indicator position, dismissibility lock on progress, error overlay hides indicator.
// ABOUTME: Renders inside a portal; we query via document.body since the dialog mounts there via Modal's createPortal.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionFlowShell } from './ActionFlowShell'

describe('<ActionFlowShell>', () => {
  it('renders nothing when open=false', () => {
    render(
      <ActionFlowShell open={false} onClose={() => {}} title="Deposit" step="input">
        body
      </ActionFlowShell>,
    )
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders title and body when open', () => {
    render(
      <ActionFlowShell open onClose={() => {}} title="Deposit" step="input">
        body
      </ActionFlowShell>,
    )
    expect(screen.getByRole('heading', { name: 'Deposit' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('positions the step indicator at index 1 for input step (default steps)', () => {
    render(
      <ActionFlowShell open onClose={() => {}} title="Deposit" step="input">
        body
      </ActionFlowShell>,
    )
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 4' })).toBeInTheDocument()
  })

  it('positions the step indicator at index 3 for progress step (default steps)', () => {
    render(
      <ActionFlowShell open onClose={() => {}} title="Deposit" step="progress">
        body
      </ActionFlowShell>,
    )
    expect(screen.getByRole('progressbar', { name: 'Step 3 of 4' })).toBeInTheDocument()
  })

  it('positions the step indicator at index 4 for complete step', () => {
    render(
      <ActionFlowShell open onClose={() => {}} title="Deposit" step="complete">
        body
      </ActionFlowShell>,
    )
    expect(screen.getByRole('progressbar', { name: 'Step 4 of 4' })).toBeInTheDocument()
  })

  it('hides the step indicator and close button when step=error', () => {
    render(
      <ActionFlowShell open onClose={() => {}} title="Deposit" step="error">
        body
      </ActionFlowShell>,
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    // error is dismissible — close button visible
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('locks dismissal during progress (no close button, ESC ignored)', () => {
    const onClose = vi.fn()
    render(
      <ActionFlowShell open onClose={onClose} title="Deposit" step="progress">
        body
      </ActionFlowShell>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked outside progress', () => {
    const onClose = vi.fn()
    render(
      <ActionFlowShell open onClose={onClose} title="Deposit" step="input">
        body
      </ActionFlowShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('respects a custom steps array', () => {
    render(
      <ActionFlowShell
        open
        onClose={() => {}}
        title="Quick send"
        step="progress"
        steps={['input', 'progress', 'complete']}
      >
        body
      </ActionFlowShell>,
    )
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 3' })).toBeInTheDocument()
  })
})
