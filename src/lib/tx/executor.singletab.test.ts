// ABOUTME: Tests that the executor's leader election raises the "open in another tab" gate at boot — a tab that can't take the
// ABOUTME: `armada-tx-executor` lock (another tab holds it) shows SingleTabGate before any sign-in, not after the user signs.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { getDefaultStore } from 'jotai'
import { anotherTabActiveAtom } from '@/state/ui'

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks')
  getDefaultStore().set(anotherTabActiveAtom, false)
  vi.resetModules()
})

function stubLocks(available: boolean) {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, _opts: unknown, cb: (lock: unknown) => Promise<void>) => {
        void cb(available ? { name: 'armada-tx-executor' } : null)
        return Promise.resolve()
      },
    },
  })
}

describe('startEngine — single-tab gate at boot', () => {
  it('another tab holds the engine lock → this tab shows "open in another tab" straight away', async () => {
    stubLocks(false)
    const { startEngine } = await import('./executor')
    startEngine()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getDefaultStore().get(anotherTabActiveAtom)).toBe(true)
  })

  it('the lock is free → this tab leads, no gate', async () => {
    stubLocks(true)
    const { startEngine } = await import('./executor')
    startEngine()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getDefaultStore().get(anotherTabActiveAtom)).toBe(false)
  })
})
