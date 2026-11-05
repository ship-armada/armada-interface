// ABOUTME: Tests for useHighFeeAck — the high-fee tick holds Confirm over 25% until given, and is asked again when the fee
// ABOUTME: (or amount) changes, e.g. a re-priced fee bouncing back to Review.

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHighFeeAck } from './useHighFeeAck'

describe('useHighFeeAck', () => {
  it('holds Confirm until acknowledged, and asks again when the fee changes', () => {
    const { result, rerender } = renderHook(({ fee }) => useHighFeeAck(fee, 1_000_000n), { initialProps: { fee: 300_000n } })
    expect(result.current.level).toBe('confirm')
    expect(result.current.blocksConfirm).toBe(true)
    act(() => result.current.setAcknowledged(true))
    expect(result.current.blocksConfirm).toBe(false)
    rerender({ fee: 320_000n })
    expect(result.current.acknowledged).toBe(false)
    expect(result.current.blocksConfirm).toBe(true)
  })

  it('never holds Confirm below the confirm threshold', () => {
    const { result } = renderHook(() => useHighFeeAck(150_000n, 1_000_000n))
    expect(result.current.level).toBe('caution')
    expect(result.current.blocksConfirm).toBe(false)
  })
})
