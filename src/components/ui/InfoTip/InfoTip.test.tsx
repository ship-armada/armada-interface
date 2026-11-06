// ABOUTME: Tests for InfoTip — an ⓘ button named by its label that shows the given explanation as a tooltip on hover,
// ABOUTME: and nothing until then.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InfoTip } from './InfoTip'

describe('<InfoTip>', () => {
  it('shows its explanation on hover, under the trigger named by its label', () => {
    render(<InfoTip text="What this figure means." label="About this figure" />)
    const trigger = screen.getByRole('button', { name: 'About this figure' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(trigger.parentElement as HTMLElement)
    expect(screen.getByRole('tooltip')).toHaveTextContent('What this figure means.')
  })
})
