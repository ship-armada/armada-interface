// ABOUTME: Tests for FullAddress — the whole address as groups of 4 in one labelled block, reading back to the exact
// ABOUTME: address when the group spacing is removed.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FullAddress } from './FullAddress'

const ZK = '0zk1qyk9nn28x0u3rwn5pknglda68wrn7gw6anjw8gg94mcj6eq5u48tlrv7j6fe3z53lama02nutwtcqc979wnce0'

describe('<FullAddress>', () => {
  it('renders every character as groups of 4', () => {
    render(<FullAddress address={ZK} />)
    const block = screen.getByRole('group', { name: 'Full address' })
    expect(block.textContent?.replace(/\s/g, '')).toBe(ZK)
    expect(block.querySelectorAll('span')).toHaveLength(Math.ceil(ZK.length / 4))
  })
})
