// ABOUTME: Tests for FeeInfo — the ⓘ beside a fee label that says what the fee pays for and who gets it: one fee's
// ABOUTME: explanation, or a combined "Fees" row's parts as a list. Shown on hover / focus.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeeInfo, shieldFeeParts } from './FeeInfo'

describe('<FeeInfo>', () => {
  it('explains a single fee', () => {
    render(<FeeInfo parts={['relayer']} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'What is this fee?' }).parentElement as HTMLElement)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Relayer fee')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Paid to the relayer that submits your private transaction. Includes the network gas.')
  })

  it('lists the parts of a combined fee', () => {
    render(<FeeInfo parts={['relayer', 'protocol', 'cctp']} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'What is this fee?' }).parentElement as HTMLElement)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('What these fees are')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Relayer fee: Paid to the relayer that submits your private transaction. Includes the network gas.',
      'Protocol fee: Armada’s shield fee (about 0.5%), kept by the privacy pool.',
      'CCTP fee: Circle’s fee for moving USDC between chains. Taken from the amount in transit.',
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
