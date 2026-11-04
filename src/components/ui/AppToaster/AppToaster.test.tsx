// ABOUTME: Tests for AppToaster — the app's one toast container: sonner, unstyled, with our token-based classes so toasts
// ABOUTME: follow the light/dark theme instead of sonner's fixed dark look.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { toast } from 'sonner'
import { AppToaster } from './AppToaster'

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
})
