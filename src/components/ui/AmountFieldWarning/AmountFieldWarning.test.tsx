// ABOUTME: Render tests for AmountFieldWarning — the above-field alert tooltip for amount validation errors.

import { describe, it, expect } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { AmountFieldWarning } from './AmountFieldWarning'
import styles from './AmountFieldWarning.module.css'

describe('<AmountFieldWarning>', () => {
  it('shows the message as an alert above its children when visible', () => {
    render(
      <AmountFieldWarning id="warn" visible message="That's more than you can deposit">
        <input aria-label="Amount" />
      </AmountFieldWarning>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("That's more than you can deposit")
    // The field it wraps is still rendered.
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
  })

  it('renders no alert when not visible', () => {
    render(
      <AmountFieldWarning id="warn" visible={false} message="hidden">
        <input aria-label="Amount" />
      </AmountFieldWarning>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
  })

  it('covers its children when placement is cover', async () => {
    render(
      <AmountFieldWarning id="warn" visible message="That's more than you can shield" placement="cover">
        <span>incl. $1 FEE</span>
      </AmountFieldWarning>,
    )
    await act(async () => {})
    expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent(
      "That's more than you can shield",
    )
    const coveredClass = styles.covered
    expect(coveredClass).toEqual(expect.any(String))
    if (typeof coveredClass !== 'string') return
    expect(screen.getByText('incl. $1 FEE').parentElement).toHaveClass(coveredClass)
  })
})
