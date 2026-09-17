// ABOUTME: Tests the leader-promotion resume glue (#3) — on becoming leader while a wallet is already
// ABOUTME: unlocked, the executor kicks resumeForWallet (the case a promoted follower hits).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// The actual lock-queue promotion can't run in jsdom (no navigator.locks) — startEngine's no-locks
// path calls onBecomeLeader synchronously, exactly as the blocking-request callback does on a real
// promotion. Mock the wallet as already unlocked so the resume-if-unlocked branch fires.
vi.mock('@/lib/shielded/keyManager', () => ({
  isUnlocked: () => true,
  getWalletId: () => 'promo-wallet',
}))

const loadAllTxMock = vi.hoisted(() => vi.fn(async () => []))
vi.mock('./storage', () => ({
  loadAllTx: loadAllTxMock,
  putTxIfFresh: vi.fn(async () => {}),
}))

describe('leader promotion resume glue (#3)', () => {
  beforeEach(() => {
    vi.resetModules()
    loadAllTxMock.mockClear()
  })

  it('resumes the active wallet when it becomes leader while unlocked', async () => {
    const { startEngine } = await import('./executor')
    // no navigator.locks → elect leader synchronously → onBecomeLeader → kmIsUnlocked() → resume.
    startEngine()
    // resumeForWallet is fire-and-forget; it calls loadAllTx(walletId) before its first await.
    await Promise.resolve()
    expect(loadAllTxMock).toHaveBeenCalledWith('promo-wallet')
  })

  it('resumes only once even if startEngine is called again (idempotent)', async () => {
    const { startEngine } = await import('./executor')
    startEngine()
    startEngine() // engineStarted guard → no-op; must not re-resume
    await Promise.resolve()
    expect(loadAllTxMock).toHaveBeenCalledTimes(1)
  })
})
