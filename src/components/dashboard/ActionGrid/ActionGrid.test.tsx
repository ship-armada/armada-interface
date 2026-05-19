// ABOUTME: Tests for ActionGrid — renders four actions and dispatches the right ModalKind on each click.
// ABOUTME: Seeds a Jotai store so we can read openModalAtom after a click.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ActionGrid } from './ActionGrid'
import { openModalAtom } from '@/state/ui'

function setup() {
  const store = createStore()
  render(
    <Provider store={store}>
      <ActionGrid />
    </Provider>,
  )
  return store
}

describe('<ActionGrid>', () => {
  it('renders all four action labels', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Deposit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Earn' })).toBeInTheDocument()
  })

  it('opens the shield modal on Deposit click', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }))
    expect(store.get(openModalAtom)).toBe('shield')
  })

  it('opens the unshield modal on Withdraw click', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(store.get(openModalAtom)).toBe('unshield')
  })

  it('opens the payment modal on Send click', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(store.get(openModalAtom)).toBe('payment')
  })

  it('opens the yield-deposit modal on Earn click', () => {
    const store = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Earn' }))
    expect(store.get(openModalAtom)).toBe('yield-deposit')
  })
})
