// ABOUTME: Tests for SingleTabGate — the full-screen "already open in another tab" message + reload CTA.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SingleTabGate } from './SingleTabGate'

describe('<SingleTabGate>', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the single-tab message', () => {
    render(<SingleTabGate />)
    expect(screen.getByText('Armada is open in another tab')).toBeInTheDocument()
    expect(screen.getByText(/single tab per browser/i)).toBeInTheDocument()
  })

  it('reloads the page from the CTA', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<SingleTabGate />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload this tab' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
