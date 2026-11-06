// ABOUTME: Tests for RequestLinkScreen's sharing — a QR of the link for in-person requests, and the device's share sheet
// ABOUTME: (where it has one) with a template that names no amount; desktop browsers without one keep Copy only.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RequestLinkScreen } from './RequestLinkScreen'

const LINK = 'https://app.armada.blue/pay-via-link?r=0zk1qyabc&a=25'

function renderScreen() {
  return render(<RequestLinkScreen paymentLink={LINK} amount="25" expiresAt={Date.now() + 86_400_000} revoked={false} onDone={vi.fn()} />)
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
})

describe('<RequestLinkScreen> sharing (10B)', () => {
  it('shows a QR code of the link, so someone nearby can scan it', () => {
    renderScreen()
    expect(screen.getByRole('img', { name: 'QR code for this payment link' })).toBeInTheDocument()
  })

  it('offers the share sheet where the device has one, with a message that names no amount', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: 'Here’s my Armada payment link:', url: LINK }))
  })

  it('a share the user backs out of is not an error', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') }),
      configurable: true,
    })
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    // Nothing breaks: the screen and its Copy stay as they were.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument())
  })

  it('has no Share button without a share sheet (most desktop browsers) — Copy covers it', () => {
    renderScreen()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })
})
