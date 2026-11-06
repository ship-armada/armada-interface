// ABOUTME: Session-only timing samples the Debug page's "Tx timings" table reads alongside the records' stage stamps —
// ABOUTME: tx completion → balance change (useBalanceLatencyProbe) and sign-in → first balance (useSignInBalanceProbe). Not persisted.

import { atom } from 'jotai'
import type { TxKind } from '@/lib/tx/types'

export interface BalanceLatencySample {
  kind: TxKind
  /** Completion → the next shielded USDC / vault-share balance change. */
  durationMs: number
}

/** This session's samples, oldest first (capped). Timed-out probes keep no sample. */
export const balanceLatencySamplesAtom = atom<readonly BalanceLatencySample[]>([])

export interface SignInLatencySample {
  /** True when this wallet had no history checkpoint on this device — a first, full sync. */
  cold: boolean
  /** Unlock → the first known shielded USDC balance. */
  durationMs: number
}

/** This session's sign-in samples, oldest first (capped). */
export const signInLatencySamplesAtom = atom<readonly SignInLatencySample[]>([])
