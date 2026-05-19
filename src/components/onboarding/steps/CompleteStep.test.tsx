// ABOUTME: Tests for CompleteStep — renders the success headline and dispatches onDone on CTA click.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompleteStep } from './CompleteStep'

describe('<CompleteStep>', () => {
  it("renders the headline", () => {
    render(<CompleteStep onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: "You're in" })).toBeInTheDocument()
  })

  it('fires onDone when the CTA is clicked', () => {
    const onDone = vi.fn()
    render(<CompleteStep onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /Go to dashboard/ }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
