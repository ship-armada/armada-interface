// ABOUTME: Module-scope transaction executor — runs stage handlers outside React lifecycle, owns AbortControllers, leader-elected via navigator.locks.
// ABOUTME: Hooks (useTx) only trigger execution; they never orchestrate. Plan §7a; reviewer rec #2 + #9.

import { getDefaultStore } from 'jotai'
import { track, trackError } from '../telemetry'
import { lifecycleFor } from './lifecycles'
import { markCancelled, markExpired, shouldResume } from './reducer'
import { loadAllTx, putTxIfFresh } from './storage'
import type { StageFor, TxKind, TxRecord } from './types'
import { txListAtom, upsertTxAtom } from '@/state/tx'
import { tabVisibleAtom } from '@/state/visibility'

const LOCK_NAME = 'armada-tx-executor'

/* ----- Public types ----- */

export interface ExecutorCtx<K extends TxKind = TxKind> {
  /** Aborts when the tx is cancelled or the engine is torn down. */
  signal: AbortSignal
  /** Persist a record update via atom + IDB (OCC enforced). */
  upsert: (record: TxRecord<K>) => Promise<void>
}

export interface StageHandler<K extends TxKind = TxKind> {
  kind: K
  /**
   * Run ONE step of the lifecycle. The handler is responsible for:
   *  - persisting the record's new stage / executionState via `ctx.upsert`
   *  - respecting `ctx.signal` and throwing on abort
   *  - never returning a value (transitions happen via `ctx.upsert`)
   *
   * The executor's chain loop reads the updated record from the atom after
   * `run` returns, and either calls `run` again for the next stage, pauses
   * (if executionState=`waiting`), or terminates (if terminal).
   */
  run(record: TxRecord<K>, ctx: ExecutorCtx<K>): Promise<void>

  /** Stages this handler can resume from on app reload. */
  resumableFrom: ReadonlyArray<StageFor<K>>
}

/* ----- Module state (intentionally module-scope, NOT React-scope) ----- */

const handlers = new Map<TxKind, StageHandler<TxKind>>()
const running = new Map<string, AbortController>()
let isLeader = false
let engineStarted = false

/* ----- Public API ----- */

export function registerHandler<K extends TxKind>(handler: StageHandler<K>): void {
  handlers.set(handler.kind, handler as unknown as StageHandler<TxKind>)
}

export function getIsLeader(): boolean {
  return isLeader
}

/**
 * Initialise the executor. Idempotent — repeated calls are no-ops.
 *
 * Acquires an exclusive `navigator.locks` lock named `armada-tx-executor`. Only
 * the holder runs handlers + resume logic. Other tabs operate as passive
 * observers (their atoms hydrate from IDB but they don't execute).
 *
 * Fire-and-forget; the caller (App.tsx) does not await.
 */
export function startEngine(): void {
  if (engineStarted) return
  engineStarted = true

  if (typeof navigator === 'undefined' || !navigator.locks) {
    // No Locks API (SSR or ancient browser): assume single-tab leader semantics.
    onBecomeLeader()
    return
  }

  navigator.locks
    .request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) {
        // Another tab holds the lock — we run in follower mode.
        isLeader = false
        track('tx.engine.started', { isLeader: false })
        return // returning releases nothing (we never had the lock)
      }
      onBecomeLeader()
      // Hold the lock for the tab's lifetime. The browser releases it on tab
      // close / navigation; another tab can then acquire it on its next start.
      await new Promise<void>(() => { /* intentional never-resolve */ })
    })
    .catch((err) => {
      trackError('tx.engine.start', err, { scope: 'tx.engine', message: 'navigator.locks.request failed' })
    })
}

/**
 * Spawn execution for an existing tx record (by id). Non-blocking; the engine
 * runs the handler chain in the background.
 *
 * Called from `useTx().submit()` (immediately after persisting the initial
 * record) and from resume-on-reload + retry paths.
 *
 * No-op on follower tabs and when no handler is registered for the kind.
 */
export function executeTx(id: string): void {
  if (!isLeader) return
  if (running.has(id)) return // already in flight; reentrancy guard

  const store = getDefaultStore()
  const record = store.get(txListAtom).find(t => t.id === id)
  if (!record) {
    trackError('tx.executor.execute', new Error('no record'), {
      scope: 'tx.executor',
      message: `executeTx called for unknown id ${id}`,
    })
    return
  }

  const handler = handlers.get(record.kind)
  if (!handler) {
    track('tx.engine.no-handler', { kind: record.kind })
    return
  }

  const controller = new AbortController()
  running.set(id, controller)
  void runHandlerChain(record, handler, controller)
}

/** Abort the in-flight handler chain for a tx and mark the record `cancelled`. */
export function cancelTx(id: string): void {
  const controller = running.get(id)
  if (controller) {
    controller.abort()
    running.delete(id)
  }
  const store = getDefaultStore()
  const record = store.get(txListAtom).find(t => t.id === id)
  if (!record) return
  // Don't clobber an already-terminal record. OCC accepts the bumped seq, so
  // without this guard cancel() on a completed/failed/expired tx would rewrite
  // its terminal state to `cancelled` in both the atom and IDB.
  if (record.executionState === 'completed'
    || record.executionState === 'failed'
    || record.executionState === 'expired'
    || record.executionState === 'cancelled') {
    return
  }
  const cancelled = markCancelled(record)
  store.set(upsertTxAtom, cancelled)
  void putTxIfFresh(cancelled)
  track('tx.cancelled', { id: cancelled.id, kind: cancelled.kind })
}

/* ----- Internals ----- */

function onBecomeLeader(): void {
  isLeader = true
  track('tx.engine.started', { isLeader: true })
  void resumeNonTerminal()
}

/**
 * Walk persisted records on app load; resume non-terminal ones; expire stale.
 *
 * Reads from IDB directly rather than `txListAtom` because hydration
 * (`useTxHistory`) races against leader-lock acquisition. If the lock is
 * acquired before hydration completes, the atom is still empty and we'd miss
 * everything. `upsertTxAtom` is OCC-safe so seeding records here cannot
 * regress any newer in-memory state that hydration produces later.
 */
async function resumeNonTerminal(): Promise<void> {
  const store = getDefaultStore()
  let records: TxRecord[]
  try {
    records = await loadAllTx()
  } catch (err) {
    trackError('tx.executor.resume', err, { scope: 'tx.executor', message: 'loadAllTx failed' })
    return
  }
  for (const record of records) {
    if (record.executionState === 'completed'
      || record.executionState === 'failed'
      || record.executionState === 'expired'
      || record.executionState === 'cancelled') {
      continue
    }
    // Seed the atom so executeTx() can find the record even if useTxHistory
    // hasn't finished hydrating yet. OCC ensures we don't clobber newer state.
    store.set(upsertTxAtom, record)
    if (shouldResume(record)) {
      executeTx(record.id)
    } else {
      const expired = markExpired(record)
      store.set(upsertTxAtom, expired)
      await putTxIfFresh(expired)
      track('tx.expired', { id: expired.id, kind: expired.kind })
    }
  }
}

async function runHandlerChain(
  initial: TxRecord,
  handler: StageHandler<TxKind>,
  controller: AbortController,
): Promise<void> {
  const store = getDefaultStore()
  let current = initial

  try {
    while (!controller.signal.aborted) {
      // Pause when the tab is hidden — even on the leader. Polite to API quotas.
      if (!store.get(tabVisibleAtom)) {
        await waitForVisibility(controller.signal)
        if (controller.signal.aborted) break
      }

      // Terminal? Stop the chain.
      if (current.executionState === 'completed'
        || current.executionState === 'failed'
        || current.executionState === 'expired'
        || current.executionState === 'cancelled') {
        break
      }

      const ctx: ExecutorCtx = {
        signal: controller.signal,
        upsert: async (rec) => {
          store.set(upsertTxAtom, rec)
          await putTxIfFresh(rec)
        },
      }

      await handler.run(current as TxRecord<TxKind>, ctx as ExecutorCtx<TxKind>)

      // Reload current state from the atom (handler wrote through ctx.upsert).
      const next = store.get(txListAtom).find(t => t.id === current.id)
      if (!next) break
      current = next

      // Handler put us in 'waiting'? Pause the chain; external trigger (e.g. a
      // poller completing, or executeTx being called again) will resume.
      if (current.executionState === 'waiting') break

      // Hard-cap on total lifecycle duration.
      const lifecycle = lifecycleFor(current.kind)
      if (Date.now() - current.createdAt > lifecycle.maxDurationMs) {
        const expired = markExpired(current)
        await ctx.upsert(expired as TxRecord<TxKind>)
        track('tx.expired', { id: current.id, kind: current.kind })
        break
      }
    }
  } catch (err) {
    trackError('tx.executor.run', err, {
      scope: 'tx.executor',
      message: `handler ${handler.kind} threw`,
    })
  } finally {
    running.delete(initial.id)
  }
}

function waitForVisibility(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const store = getDefaultStore()
    const unsub = store.sub(tabVisibleAtom, () => {
      if (store.get(tabVisibleAtom)) {
        unsub()
        resolve()
      }
    })
    signal.addEventListener('abort', () => {
      unsub()
      resolve()
    }, { once: true })
  })
}
