// ABOUTME: Tests for ChainSelect — renders chain options, fires onChange with the parsed chainId, honors custom chains list.
// ABOUTME: Default-chains path is exercised via the network.ts local fixture (Anvil hub + 2 clients).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChainSelect } from './ChainSelect'

describe('<ChainSelect>', () => {
  it('renders all configured chains by default', () => {
    render(<ChainSelect value={31337} onChange={() => {}} label="From chain" />)
    // Local mode: hub 31337 + clientA 31338 + clientB 31339
    expect(screen.getByRole('option', { name: /Anvil Hub/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Anvil Client A/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Anvil Client B/ })).toBeInTheDocument()
  })

  it('honors the chains prop for a restricted list', () => {
    const chains = [
      { chainId: 1, domain: 0, name: 'Mainnet', rpcUrls: ['x'] as const },
    ]
    render(<ChainSelect value={1} onChange={() => {}} chains={chains} />)
    expect(screen.getByRole('option', { name: 'Mainnet' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Anvil/ })).toBeNull()
  })

  it('fires onChange with the numeric chainId', () => {
    const onChange = vi.fn()
    render(<ChainSelect value={31337} onChange={onChange} label="From chain" />)
    fireEvent.change(screen.getByLabelText('From chain'), { target: { value: '31338' } })
    expect(onChange).toHaveBeenCalledWith(31338)
  })

  it('respects disabled', () => {
    render(<ChainSelect value={31337} onChange={() => {}} label="From chain" disabled />)
    expect(screen.getByLabelText('From chain')).toBeDisabled()
  })
})
