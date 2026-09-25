// ABOUTME: Tests for useNoteCounts — the per-token spendable note counts Settings uses to offer "Merge notes",
// ABOUTME: read from the SDK scan state only while enabled.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { withTestQueryClient } from '@/test-utils/queryClient'

const hoisted = vi.hoisted(() => ({ readSdkNoteCounts: vi.fn() }))
vi.mock('@/lib/shielded/sdk-read', () => ({ readSdkNoteCounts: hoisted.readSdkNoteCounts }))

import { useNoteCounts } from './useNoteCounts'

const wrapper = ({ children }: { children: ReactNode }) => withTestQueryClient(children)

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.readSdkNoteCounts.mockResolvedValue({ usdc: 23, shares: 2 })
})

describe('useNoteCounts', () => {
  it('reads the note count per mergeable token', async () => {
    const { result } = renderHook(() => useNoteCounts(true, 'k'), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ usdc: 23, shares: 2 }))
  })

  it('reads nothing while disabled (wallet locked / Settings closed)', () => {
    const { result } = renderHook(() => useNoteCounts(false, 'k'), { wrapper })
    expect(result.current).toBeNull()
    expect(hoisted.readSdkNoteCounts).not.toHaveBeenCalled()
  })
})
