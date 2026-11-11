// ABOUTME: Jotai atoms for the tx list + derived selectors. The list is the source of truth; UI reads activeTxListAtom (scoped to the active walletId) so one wallet's history never shows under another.
// ABOUTME: Hydration from IDB happens in a top-level effect (see hooks/useTxHistory). Writes go through upsertTxAtom which enforces OCC via updatedSeq.

import { atom } from 'jotai'
import type { TxExecutionState, TxRecord } from '@/lib/tx/types'
import { NON_TERMINAL_STATES, isTerminalState } from '@/lib/tx/types'
import { activeShieldedWalletIdAtom } from './wallet'

/**
 * All tx records — pending and terminal — for every shielded wallet this device has ever
 * unlocked. Source of truth. UI surfaces (the Dashboard's activity list and All activity
 * panel, the header's pending pill) MUST read `activeTxListAtom` instead so a wallet-switch (or lock) doesn't leak prior
 * history into the new session. The executor + storage layer write here directly; they're
 * wallet-agnostic by design and walletContext on each record carries the binding.
 */
export const txListAtom = atom<TxRecord[]>([])

/**
 * The shielded wallet whose stored records `useTxHistory` has finished loading into `txListAtom` (null while
 * locked or loading). The tx-notice watcher takes the list at that moment as its baseline, so loading history
 * never reads as news.
 */
export const txHistoryHydratedAtom = atom<string | null>(null)

/**
 * Records scoped to the currently-active shielded wallet — drives all UI consumers. When no
 * wallet is active (never unlocked, reset, or the account-switch fallback that clears the id),
 * returns [] so leaking-prior-history is structurally impossible. A plain lock keeps the active
 * id; there hooks/useTxHistory empties `txListAtom` instead.
 *
 * Defense in depth: hooks/useTxHistory also clears + re-hydrates on activeId change and on lock,
 * so the atom rarely contains foreign records to begin with. This filter is the second perimeter.
 */
export const activeTxListAtom = atom((get) => {
  const activeId = get(activeShieldedWalletIdAtom)
  if (!activeId) return []
  return get(txListAtom).filter(t => t.walletContext.shieldedWalletId === activeId)
})

/**
 * In-flight txs (non-terminal) for the active wallet only.
 *
 * Note: sourced from `activeTxListAtom`, NOT `txListAtom`. This means the header's pending pill +
 * `useAutoLock`'s defer-on-inflight check see only the active wallet's pending operations.
 * If the user account-switches mid-flow (`useWallet` auto-locks the shielded wallet), the
 * previous wallet's pending txs disappear from the dashboard — by design, they belong to a
 * locked identity the user is no longer operating.
 */
export const pendingTxsAtom = atom((get) => {
  const states = new Set<TxExecutionState>(NON_TERMINAL_STATES)
  return get(activeTxListAtom).filter(t => states.has(t.executionState))
})

/** Look up a single record by id. */
export const txByIdAtom = (id: string) => atom((get) => {
  return get(txListAtom).find(t => t.id === id)
})

/**
 * Write-only helper: upsert a record by id with optimistic concurrency.
 * Rejects writes whose updatedSeq is not strictly greater than the existing record's.
 */
export const upsertTxAtom = atom(null, (get, set, record: TxRecord) => {
  const list = get(txListAtom)
  const idx = list.findIndex(t => t.id === record.id)
  if (idx === -1) {
    set(txListAtom, [record, ...list])
    return
  }
  const existing = list[idx]
  // Terminal-state write guard: never resurrect a settled record into a non-terminal state,
  // regardless of updatedSeq. A cancel/dismiss writes the terminal record with a fresh seq, but
  // a poller or proof-progress writer holding a stale in-flight reference can still bump its own
  // seq higher and would otherwise flip `cancelled`/`failed`/`expired` back to `active`/`waiting`.
  // Two exceptions: terminal→terminal (the history-recovery upgrade path; see lib/tx/CLAUDE.md),
  // and terminal→`retrying` (an intentional `retryTx`/`markRetrying`). Stale poller/progress
  // writes only ever produce `active`/`waiting`, never `retrying`, so the carve-out is safe. (P0-3)
  if (
    existing
    && isTerminalState(existing.executionState)
    && !isTerminalState(record.executionState)
    && record.executionState !== 'retrying'
  ) {
    return
  }
  if (existing && existing.updatedSeq >= record.updatedSeq) {
    // Silently drop stale writes. Telemetry is emitted at the storage layer
    // (see lib/tx/storage.ts::putTxIfFresh) so we don't double-log.
    return
  }
  const next = list.slice()
  next[idx] = record
  set(txListAtom, next)
})
