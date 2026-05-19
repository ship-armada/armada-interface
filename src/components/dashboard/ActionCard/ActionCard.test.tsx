// ABOUTME: Tests for ActionCard — renders icon/title/subtitle, fires onClick, respects disabled state.
// ABOUTME: We pass a stub icon component to avoid coupling to lucide internals.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArrowDownToLine } from 'lucide-react'
import { ActionCard } from './ActionCard'

describe('<ActionCard>', () => {
  it('renders title and subtitle', () => {
    render(
      <ActionCard
        icon={ArrowDownToLine}
        title="Deposit"
        subtitle="Move USDC into private balance"
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.getByText('Move USDC into private balance')).toBeInTheDocument()
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(
      <ActionCard
        icon={ArrowDownToLine}
        title="Deposit"
        subtitle="x"
        onClick={onClick}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <ActionCard
        icon={ArrowDownToLine}
        title="Deposit"
        subtitle="x"
        onClick={onClick}
        disabled
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
