// ABOUTME: Tests for AppToaster — the app's one toast container: sonner, unstyled, with our token-based classes so toasts
// ABOUTME: follow the light/dark theme instead of sonner's fixed dark look — custom toasts (tx notices) included.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { toast } from 'sonner'
import { AppToaster } from './AppToaster'
import { TxNoticeToast } from '@/components/tx/TxNoticeToast'

afterEach(() => {
  act(() => toast.dismiss())
  cleanup()
})

describe('<AppToaster>', () => {
  it('renders toasts with the app\'s own styling, not sonner\'s theme', async () => {
    render(<AppToaster />)
    act(() => {
      toast('Transactions run in your first Armada tab.')
    })
    const text = await screen.findByText('Transactions run in your first Armada tab.')
    const item = text.closest('[data-sonner-toast]')
    expect(item).not.toBeNull()
    expect(item?.className).toMatch(/toast/)
    expect(item).toHaveAttribute('data-styled', 'false')
  })

  it('wraps a custom toast (a tx notice) in the same styled card, which the notice relies on for its surface', async () => {
    render(<AppToaster />)
    act(() => {
      toast.custom(() => <TxNoticeToast tone="success" title="Sent 5.00 USDC" onView={() => {}} />)
    })
    const notice = await screen.findByText('Sent 5.00 USDC')
    const item = notice.closest('[data-sonner-toast]')
    expect(item?.className).toMatch(/toast/)
  })
})

