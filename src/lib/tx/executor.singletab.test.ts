// ABOUTME: Tests that the executor's leader election raises the "open in another tab" gate at boot — a tab that can't take the
// ABOUTME: `armada-tx-executor` lock (another tab holds it) shows SingleTabGate before any sign-in, not after the user signs.

import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks')
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

/**
 * Boot a fresh executor and read the gate it writes. The atom and store are loaded AFTER the module reset, from the same
 * graph as the executor: a top-of-file import would be a different atom instance from the executor's after
 * vi.resetModules(), so a test reading it could never see the executor's write.
 */
async function bootAndReadGate(lockAvailable: boolean): Promise<boolean> {
  stubLocks(lockAvailable)
  const { startEngine } = await import('./executor')
  const { anotherTabActiveAtom } = await import('@/state/ui')
  const { getDefaultStore } = await import('jotai')
  startEngine()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return getDefaultStore().get(anotherTabActiveAtom)
}

describe('startEngine — single-tab gate at boot', () => {
  it('another tab holds the engine lock → this tab shows "open in another tab" straight away', async () => {
    expect(await bootAndReadGate(false)).toBe(true)
  })

  it('the lock is free → this tab leads, no gate', async () => {
    expect(await bootAndReadGate(true)).toBe(false)
  })
})
