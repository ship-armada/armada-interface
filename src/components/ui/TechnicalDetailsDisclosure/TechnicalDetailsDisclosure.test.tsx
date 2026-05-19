// ABOUTME: Tests for TechnicalDetailsDisclosure — label rendering, default-open, toggle behavior, custom label support.
// ABOUTME: Built on native <details>; we drive toggling via fireEvent.click on the summary element.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TechnicalDetailsDisclosure } from './TechnicalDetailsDisclosure'

describe('<TechnicalDetailsDisclosure>', () => {
  it('renders the default label', () => {
    render(
      <TechnicalDetailsDisclosure>
        <div>secret content</div>
      </TechnicalDetailsDisclosure>,
    )
    expect(screen.getByText('Show technical details')).toBeInTheDocument()
  })

  it('renders a custom label', () => {
    render(
      <TechnicalDetailsDisclosure label="More info">
        <div>x</div>
      </TechnicalDetailsDisclosure>,
    )
    expect(screen.getByText('More info')).toBeInTheDocument()
  })

  it('starts closed by default', () => {
    const { container } = render(
      <TechnicalDetailsDisclosure>
        <div>inside</div>
      </TechnicalDetailsDisclosure>,
    )
    expect(container.querySelector('details')?.open).toBe(false)
  })

  it('starts open when defaultOpen is true', () => {
    const { container } = render(
      <TechnicalDetailsDisclosure defaultOpen>
        <div>inside</div>
      </TechnicalDetailsDisclosure>,
    )
    expect(container.querySelector('details')?.open).toBe(true)
  })

  it('toggles open when the summary is clicked', () => {
    const { container } = render(
      <TechnicalDetailsDisclosure>
        <div>inside</div>
      </TechnicalDetailsDisclosure>,
    )
    const details = container.querySelector('details') as HTMLDetailsElement
    const summary = container.querySelector('summary') as HTMLElement
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    // jsdom doesn't dispatch the toggle event automatically, but the open
    // attribute mirrors the native behavior of clicking summary.
    expect(details.open).toBe(true)
  })
})
