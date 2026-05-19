// ABOUTME: Tests for the Card primitive — renders children, applies variant class, passes through extra props.
// ABOUTME: Visual/CSS assertions are limited to class name presence since vitest disables CSS module hashing.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('<Card>', () => {
  it('renders children', () => {
    render(<Card>hello</Card>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('forwards arbitrary div props', () => {
    render(<Card data-testid="x" aria-label="thing">body</Card>)
    const node = screen.getByTestId('x')
    expect(node).toHaveAttribute('aria-label', 'thing')
  })

  it('applies the raised variant class when requested', () => {
    const { rerender } = render(<Card data-testid="x">body</Card>)
    const defaultClass = screen.getByTestId('x').className
    rerender(<Card data-testid="x" variant="raised">body</Card>)
    const raisedClass = screen.getByTestId('x').className
    expect(raisedClass).not.toBe(defaultClass)
  })

  it('appends consumer-provided className', () => {
    render(<Card data-testid="x" className="extra">body</Card>)
    expect(screen.getByTestId('x').className).toMatch(/extra/)
  })
})
