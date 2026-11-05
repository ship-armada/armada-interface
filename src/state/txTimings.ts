// ABOUTME: Session-only timing samples the Debug page's "Tx timings" table reads alongside the records' stage stamps —
// ABOUTME: how long after a tx completed the shielded balance changed (useBalanceLatencyProbe). Not persisted.

import { atom } from 'jotai'
import type { TxKind } from '@/lib/tx/types'

export interface BalanceLatencySample {
  kind: TxKind
  /** Completion → the next shielded USDC / vault-share balance change. */
  durationMs: number
}

/** This session's samples, oldest first (capped). Timed-out probes keep no sample. */
export const balanceLatencySamplesAtom = atom<readonly BalanceLatencySample[]>([])
