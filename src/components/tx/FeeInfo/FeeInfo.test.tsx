// ABOUTME: Tests for FeeInfo — the ⓘ beside a fee label that says what the fee pays for and who gets it: one fee's short
// ABOUTME: explanation (no heading — the label names it), or a combined "Fees" row's parts as a list. Shown on hover / focus.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeeInfo, shieldFeeParts } from './FeeInfo'

describe('<FeeInfo>', () => {
  it('explains a single fee', () => {
    render(<FeeInfo parts={['relayer']} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'What is this fee?' }).parentElement as HTMLElement)
    // The row's label already names the fee, so the tooltip is just the explanation — no heading.
    expect(screen.getByRole('tooltip').textContent).toBe('Pays the relayer that submits your transaction, network gas included.')
  })

  it('lists the parts of a combined fee', () => {
    render(<FeeInfo parts={['relayer', 'protocol', 'cctp']} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'What is this fee?' }).parentElement as HTMLElement)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).not.toHaveTextContent('What these fees are')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Relayer fee: Pays the relayer that submits your transaction, network gas included.',
      'Protocol fee: Armada’s ~0.5% shield fee.',
      'CCTP fee: Circle’s fee to move USDC between chains, taken from the amount sent.',
    ])
  })
})

describe('shieldFeeParts', () => {
  it('a gasless shield pays the relayer and the protocol fee; cross-chain adds CCTP; direct has no relayer', () => {
    expect(shieldFeeParts({ gasless: true, crossChain: false })).toEqual(['relayer', 'protocol'])
    expect(shieldFeeParts({ gasless: false, crossChain: true })).toEqual(['protocol', 'cctp'])
    expect(shieldFeeParts({ gasless: true, crossChain: true })).toEqual(['relayer', 'protocol', 'cctp'])
  })
})
