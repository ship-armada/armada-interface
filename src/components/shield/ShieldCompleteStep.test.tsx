// ABOUTME: Tests for ShieldCompleteStep — renders the success headline, the deposited amount, and dispatches onDone.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShieldCompleteStep } from './ShieldCompleteStep'

describe('<ShieldCompleteStep>', () => {
  it('renders the headline and the net amount in the body copy', () => {
    render(<ShieldCompleteStep netAmount={250_500_000n} onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Success' })).toBeInTheDocument()
    expect(screen.getByText(/You've deposited 250\.50 USDC/)).toBeInTheDocument()
  })

  it('fires onDone when the Done CTA is clicked', () => {
    const onDone = vi.fn()
    render(<ShieldCompleteStep netAmount={1_000_000n} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
