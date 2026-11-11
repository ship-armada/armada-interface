// ABOUTME: Render/interaction test for the activity search input — typing fires onChange, and the placeholder offers
// ABOUTME: amount search only while balances are shown.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivitySearch } from './ActivitySearch'

describe('ActivitySearch', () => {
  it('fires onChange with the typed value', () => {
    const onChange = vi.fn()
    render(<ActivitySearch value="" onChange={onChange} amountsSearchable />)
    fireEvent.change(screen.getByLabelText('Search activity'), {
      target: { value: '0xdeadbeef' },
    })
    expect(onChange).toHaveBeenCalledWith('0xdeadbeef')
  })

  it('offers amount search only while balances are shown', () => {
    const { rerender } = render(<ActivitySearch value="" onChange={() => {}} amountsSearchable />)
    expect(screen.getByPlaceholderText('Search address, amount or tx hash')).toBeInTheDocument()
    rerender(<ActivitySearch value="" onChange={() => {}} amountsSearchable={false} />)
    expect(screen.getByPlaceholderText('Search address or tx hash')).toBeInTheDocument()
  })
})
