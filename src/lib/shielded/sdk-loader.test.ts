// ABOUTME: Tests for sdk-loader — the SDK loads once however many callers ask, and a failed load (a dropped connection fetching
// ABOUTME: the chunk) isn't remembered, so the next call retries instead of failing forever; whenSdkLoaded waits without loading.

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

describe('whenSdkLoaded', () => {
  it('waits for a load someone else starts, without starting one itself', async () => {
    let evaluations = 0
    vi.doMock('@armada/sdk', () => {
      evaluations += 1
      return { marker: 'sdk' }
    })
    const { loadSdk, whenSdkLoaded } = await import('./sdk-loader')
    let loaded = false
    void whenSdkLoaded().then(() => {
      loaded = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(loaded).toBe(false)
    expect(evaluations).toBe(0)
    await loadSdk()
    await whenSdkLoaded()
    expect(loaded).toBe(true)
  })

  it('stays pending through a failed load and resolves on the retry that succeeds', async () => {
    vi.doMock('@armada/sdk', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    const { loadSdk, whenSdkLoaded } = await import('./sdk-loader')
    let loaded = false
    void whenSdkLoaded().then(() => {
      loaded = true
    })
    await expect(loadSdk()).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loaded).toBe(false)
    vi.doMock('@armada/sdk', () => ({ marker: 'sdk' }))
    await loadSdk()
    await whenSdkLoaded()
    expect(loaded).toBe(true)
  })
})
