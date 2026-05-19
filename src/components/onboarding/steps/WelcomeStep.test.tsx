// ABOUTME: Tests for WelcomeStep — renders headline + body + Create CTA, click fires onContinue.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeStep } from './WelcomeStep'

describe('<WelcomeStep>', () => {
  it('renders the headline', () => {
    render(<WelcomeStep onContinue={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Create your private USDC account' })).toBeInTheDocument()
  })

  it('fires onContinue when the Create CTA is clicked', () => {
    const onContinue = vi.fn()
    render(<WelcomeStep onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
