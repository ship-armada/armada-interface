// ABOUTME: Tests for sdk-loader — the SDK loads once however many callers ask, and a failed load (a dropped connection fetching
// ABOUTME: the chunk) isn't remembered, so the next call retries instead of failing forever.

import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('@armada/sdk')
})

describe('loadSdk', () => {
  it('loads the SDK once for every caller', async () => {
    let evaluations = 0
    vi.doMock('@armada/sdk', () => {
      evaluations += 1
      return { marker: 'sdk' }
    })
    const { loadSdk } = await import('./sdk-loader')
    const [a, b] = await Promise.all([loadSdk(), loadSdk()])
    expect(a).toBe(b)
    expect(await loadSdk()).toBe(a)
    expect(evaluations).toBe(1)
  })

  it('retries after a failed load instead of keeping the failure', async () => {
    vi.doMock('@armada/sdk', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    const { loadSdk } = await import('./sdk-loader')
    await expect(loadSdk()).rejects.toThrow()
    vi.doMock('@armada/sdk', () => ({ marker: 'sdk' }))
    await expect(loadSdk()).resolves.toMatchObject({ marker: 'sdk' })
  })
})
