// ABOUTME: Unit tests for the optimistic in-flight spend bridge — stash→mark, no-op, and clear paths, and that
// ABOUTME: the SDK's async hold/release writes are awaited (durable on resolve) with failures reported, not thrown.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  markSpendPending: vi.fn(),
  clearSpendPending: vi.fn(),
  getSdkWallet: vi.fn(),
  trackError: vi.fn(),
}))
vi.mock('./sdk-read', () => ({ getSdkWallet: hoisted.getSdkWallet }))
vi.mock('../telemetry', () => ({ trackError: hoisted.trackError }))

import {
  stashSpendPlan,
  forgetSpendPlan,
  markSpendPendingForRecord,
  clearSpendPendingForTx,
} from './pending-spend'

const PLAN = { id: 'plan-1' } as never

beforeEach(() => {
  hoisted.markSpendPending.mockReset()
  hoisted.clearSpendPending.mockReset()
  hoisted.getSdkWallet.mockReset()
  hoisted.trackError.mockReset()
  hoisted.getSdkWallet.mockResolvedValue({
    markSpendPending: hoisted.markSpendPending,
    clearSpendPending: hoisted.clearSpendPending,
  })
})

describe('markSpendPendingForRecord', () => {
  it('marks the stashed plan with the on-chain txid, then forgets it', async () => {
    stashSpendPlan('rec-1', [PLAN])
    await markSpendPendingForRecord('rec-1', '0xhash')
    expect(hoisted.markSpendPending).toHaveBeenCalledWith([PLAN], '0xhash')
    // A second call is a no-op (the plan was consumed) — no double-mark.
    await markSpendPendingForRecord('rec-1', '0xhash')
    expect(hoisted.markSpendPending).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when no plan was stashed (resumed / non-spend tx)', async () => {
    await markSpendPendingForRecord('unknown', '0xhash')
    expect(hoisted.getSdkWallet).not.toHaveBeenCalled()
    expect(hoisted.markSpendPending).not.toHaveBeenCalled()
  })

  it('never throws if the SDK mark fails (best-effort hardening)', async () => {
    stashSpendPlan('rec-2', [PLAN])
    hoisted.markSpendPending.mockImplementation(() => { throw new Error('boom') })
    await expect(markSpendPendingForRecord('rec-2', '0xhash')).resolves.toBeUndefined()
  })

  // WHY: the SDK's markSpendPending resolves once the hold is written to storage. The bridge must not
  // resolve before that, or a handler can move on (or the tab close) with the hold not yet durable — and
  // a reload would then let a follow-up spend reselect the in-flight notes.
  it('resolves only after the SDK has written the hold', async () => {
    let written = false
    hoisted.markSpendPending.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5))
      written = true
    })
    stashSpendPlan('rec-4', [PLAN])
    await markSpendPendingForRecord('rec-4', '0xhash')
    expect(written).toBe(true)
  })

  it('reports an async hold-write failure instead of leaving it unhandled', async () => {
    const err = new Error('QuotaExceededError')
    hoisted.markSpendPending.mockRejectedValue(err)
    stashSpendPlan('rec-5', [PLAN])
    await expect(markSpendPendingForRecord('rec-5', '0xhash')).resolves.toBeUndefined()
    expect(hoisted.trackError).toHaveBeenCalledWith('shielded.pendingSpend.mark', err)
  })
})

describe('forgetSpendPlan', () => {
  it('drops a stashed plan so a later mark is a no-op', async () => {
    stashSpendPlan('rec-3', [PLAN])
    forgetSpendPlan('rec-3')
    await markSpendPendingForRecord('rec-3', '0xhash')
    expect(hoisted.markSpendPending).not.toHaveBeenCalled()
  })
})

describe('clearSpendPendingForTx', () => {
  it('clears the SDK holds for a dropped/reverted txid', async () => {
    await clearSpendPendingForTx('0xdead')
    expect(hoisted.clearSpendPending).toHaveBeenCalledWith('0xdead')
  })

  it('never throws if the SDK clear fails', async () => {
    hoisted.clearSpendPending.mockImplementation(() => { throw new Error('boom') })
    await expect(clearSpendPendingForTx('0xdead')).resolves.toBeUndefined()
  })

  it('resolves only after the SDK has written the release', async () => {
    let written = false
    hoisted.clearSpendPending.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5))
      written = true
    })
    await clearSpendPendingForTx('0xdead')
    expect(written).toBe(true)
  })

  it('reports an async release-write failure instead of leaving it unhandled', async () => {
    const err = new Error('disk full')
    hoisted.clearSpendPending.mockRejectedValue(err)
    await expect(clearSpendPendingForTx('0xdead')).resolves.toBeUndefined()
    expect(hoisted.trackError).toHaveBeenCalledWith('shielded.pendingSpend.clear', err)
  })
})
