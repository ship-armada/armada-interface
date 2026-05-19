// ABOUTME: Tests for Tabs — renders all items, marks the selected one aria-selected, fires onSelect on click, respects disabled items.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tabs } from './Tabs'

const items = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
  { id: 'three', label: 'Three', disabled: true },
] as const

describe('<Tabs>', () => {
  it('renders all items as tabs', () => {
    render(<Tabs items={items} selected="one" onSelect={() => {}} ariaLabel="Demo" />)
    expect(screen.getByRole('tab', { name: 'One' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Two' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Three' })).toBeInTheDocument()
  })

  it('exposes role="tablist" with the supplied aria label', () => {
    render(<Tabs items={items} selected="one" onSelect={() => {}} ariaLabel="Demo" />)
    expect(screen.getByRole('tablist', { name: 'Demo' })).toBeInTheDocument()
  })

  it('marks the selected tab with aria-selected=true', () => {
    render(<Tabs items={items} selected="two" onSelect={() => {}} ariaLabel="Demo" />)
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'false')
  })

  it('fires onSelect with the item id on click', () => {
    const onSelect = vi.fn()
    render(<Tabs items={items} selected="one" onSelect={onSelect} ariaLabel="Demo" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(onSelect).toHaveBeenCalledWith('two')
  })

  it('does not fire onSelect for a disabled tab', () => {
    const onSelect = vi.fn()
    render(<Tabs items={items} selected="one" onSelect={onSelect} ariaLabel="Demo" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Three' }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
